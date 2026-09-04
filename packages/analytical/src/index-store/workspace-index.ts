/**
 * Host-agnostic workspace ideas index: parse → extract → SQLite.
 * VS Code / CLI / MCP supply file lists and path display; this owns indexing.
 *
 * Public methods are the semantic surface; sync/file/mtime details live in:
 * - workspace-index-sync.ts
 * - workspace-index-file.ts
 * - workspace-mtime.ts
 *
 * rq:["../../../../reqlan rq/indexer/indexer.rq".index]
 * rq:["../../../../reqlan rq/indexer/indexer.rq".ownership]
 * rq:["../../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".index_ideas]
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".indexing_incrementality]
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_auto]
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_open]
 * rq:["../../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_metrics]
 * rq:["../../../../reqlan rq/indexer/indexer.rq".index_diagnostics_timing]
 */
import { fsPathFromFileUri } from '../core/path-relative.js';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { IDEAS_INDEX_FILENAME, INDEX_DIAGNOSTICS_FILENAME } from '../core/application-memory.js';
import { errorCauseMessage, toFileIndexIssueView, toIndexErrorDetail } from '../core/index-error.js';
import { isIgnoredPath, loadRqIgnore, type RqIgnoreFilter } from '../core/rqignore.js';
import { resolveWorkspaceFileUri, toWorkspaceRelativePath } from '../core/workspace-paths.js';
import { isSecretRqPath } from '../export/secret-rq.js';
import type { IndexState } from '../core/index-state-types.js';
import { loadNativeEngine } from '../native/load-native.js';
import { NativeSqlConnection } from '../native/native-sql-db.js';
import { NativeWorkspaceIndex } from '../native/native-workspace-index.js';
import type { OverviewCoverageScores } from '../native/native-workspace-index.js';
import type { FuzzySearchHit } from './fuzzy-search-hit.js';
import {
    IndexDiagnosticsStore,
    pathDepthFromUri,
    type IndexDiagnosticsOverview,
    type IndexFileTimingRow,
    type IndexSyncRunSummary,
    type IndexTimingTrigger
} from './index-diagnostics-store.js';
import { recordCaughtFileIssue } from './index-file-error.js';
import type { IndexStatusSnapshot, IndexSyncProgress } from './index-status.js';
import { SqliteIndexStore } from './sqlite-store.js';
import {
    checkStaleFiles as runStaleCheck,
    runSoftSync,
    type IdleCheckResult
} from './workspace-index-sync.js';
import type { IndexOneFileResult } from './workspace-index-file.js';

export type { IndexStatusSnapshot, IndexSyncProgress } from './index-status.js';
export type { IdleCheckResult } from './workspace-index-sync.js';

export interface FuzzySearchResult {
    hits: FuzzySearchHit[];
    total: number;
    truncated: boolean;
}

const EMPTY_STATUS_SNAPSHOT: IndexStatusSnapshot = {
    state: 'uninitialized',
    ready: false,
    ideaCount: 0,
    edgeCount: 0,
    fileIssueCount: 0,
    fileIssues: [],
    recentDocumentUpdates: [],
    recentWorkspaceChanges: []
};

export class WorkspaceIndex {
    private sqlite?: SqliteIndexStore;
    private diagnostics?: IndexDiagnosticsStore;
    private native?: NativeWorkspaceIndex;
    private syncQueue = Promise.resolve();
    private syncInFlight?: Promise<boolean>;
    private syncCancelRequested = false;
    private nextTimingTrigger: IndexTimingTrigger = 'soft_sync';
    private readonly catalogListeners = new Set<() => void>();
    private readonly statusListeners = new Set<() => void>();
    private rqFilePaths: string[] = [];
    private rqIgnore: RqIgnoreFilter;

    constructor(
        private readonly storagePath: string,
        private readonly workspaceRoot: string
    ) {
        this.rqIgnore = loadRqIgnore(workspaceRoot);
    }

    subscribeCatalogUpdates(listener: () => void): () => void {
        this.catalogListeners.add(listener);
        return () => {
            this.catalogListeners.delete(listener);
        };
    }

    subscribeStatusUpdates(listener: () => void): () => void {
        this.statusListeners.add(listener);
        return () => {
            this.statusListeners.delete(listener);
        };
    }

    get state(): IndexState {
        return this.native ? this.native.indexState() : 'uninitialized';
    }

    get isReady(): boolean {
        return this.state === 'ready';
    }

    get indexStore(): SqliteIndexStore {
        if (!this.sqlite) {
            throw new Error('Index store is not open');
        }
        return this.sqlite;
    }

    /**
     * Rank ideas and file names in the native search module. Does not copy the catalog into JS.
     * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
     * rq:["../../../../reqlan rq/core_analysis/search.rq".file_search]
     * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
     */
    fuzzySearch(
        query: string,
        options?: { limit?: number; requireQuery?: boolean; offset?: number }
    ): FuzzySearchResult {
        if (!this.native) {
            throw new Error('Index store is not open');
        }
        const result = this.native.fuzzySearch(
            query,
            options?.limit,
            options?.requireQuery ?? false,
            options?.offset
        );
        return {
            hits: result.hits.map(hit => ({
                id: hit.id,
                name: hit.name,
                kind: hit.kind as FuzzySearchHit['kind'],
                fileUri: hit.fileUri,
                summary: hit.summary,
                lineStart: hit.lineStart,
                score: hit.score
            })),
            total: result.total,
            truncated: result.truncated
        };
    }

    /**
     * Fill git creation / modified dates and change counts for ideas via native
     * git history (all missing ideas when `ideaIds` is omitted). The extension
     * only schedules background waves; the git log + persist work stays native.
     * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
     */
    fillGitDates(ideaIds?: string[]): number {
        if (!this.native) {
            return 0;
        }
        return this.native.fillGitDates(ideaIds);
    }

    /**
     * Compute Ideas Summary overview coverage over the workspace base natively.
     * rq:["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]
     */
    computeOverviewCoverage(): OverviewCoverageScores {
        if (!this.native) {
            throw new Error('Index store is not open');
        }
        return this.native.computeOverviewCoverage();
    }

    getStatusSnapshot(relativePath: (uri: string) => string = uri => this.relativePath(uri)): IndexStatusSnapshot {
        if (!this.native) {
            return { ...EMPTY_STATUS_SNAPSHOT };
        }
        const snapshot = this.native.statusSnapshot();
        return {
            state: snapshot.state,
            ready: snapshot.ready,
            ideaCount: snapshot.ideaCount,
            edgeCount: snapshot.edgeCount,
            fileIssueCount: snapshot.fileIssueCount,
            lastError: snapshot.lastError
                ? toIndexErrorDetail(snapshot.lastError, relativePath)
                : undefined,
            fileIssues: snapshot.fileIssues.map(issue => toFileIndexIssueView(issue, relativePath)),
            syncProgress: snapshot.syncProgress ?? undefined,
            recentDocumentUpdates: snapshot.recentDocumentUpdates,
            recentWorkspaceChanges: snapshot.recentWorkspaceChanges
        };
    }

    /** Open the SQLite store (does not sync). Idempotent when already open. */
    async open(): Promise<void> {
        if (this.sqlite && this.native) {
            const state = this.state;
            if (state === 'idle' || state === 'ready' || state === 'syncing' || state === 'opening') {
                return;
            }
        }
        // Core native engine is required for index open/sync (no sql.js fallback).
        loadNativeEngine();
        // A fresh runtime starts 'uninitialized'; reuse an existing one so error
        // recovery (error → activate) keeps the persisted diagnostics connection.
        if (!this.native) {
            this.native = NativeWorkspaceIndex.open(this.workspaceRoot, this.storagePath);
        }
        const native = this.native;
        if (!native.canDispatchIndex('activate')) {
            if (this.sqlite && (this.state === 'idle' || this.state === 'ready' || this.state === 'syncing')) {
                return;
            }
            native.recordIndexError(`Cannot open idea index from state ${this.state}`, { phase: 'open' });
            this.notifyStatusUpdated();
            throw new Error(`Cannot open idea index from state ${this.state}`);
        }
        native.dispatchIndex('activate');
        try {
            const dbPath = join(this.storagePath, IDEAS_INDEX_FILENAME);
            this.sqlite = await SqliteIndexStore.fromConnection(
                NativeSqlConnection.fromWorkspaceIdeas(native, dbPath)
            );
            try {
                const diagnosticsPath = join(this.storagePath, INDEX_DIAGNOSTICS_FILENAME);
                this.diagnostics = await IndexDiagnosticsStore.fromConnection(
                    NativeSqlConnection.fromWorkspaceDiagnostics(native, diagnosticsPath)
                );
            } catch {
                this.diagnostics = undefined;
            }
            native.dispatchIndex('opened');
            this.notifyStatusUpdated();
        } catch (error) {
            native.dispatchIndex('fail');
            native.recordIndexError('Failed to open idea index', {
                phase: 'open',
                cause: errorCauseMessage(error)
            });
            this.notifyStatusUpdated();
            throw error;
        }
    }

    /**
     * Bring this index to ready: open if needed, then soft-sync.
     * No-op when already ready; joins an in-flight sync.
     */
    async ensureReady(filePaths?: string[]): Promise<boolean> {
        if (this.isReady) {
            return true;
        }
        if (this.syncInFlight) {
            return this.syncInFlight;
        }
        if (!this.sqlite) {
            try {
                await this.open();
            } catch {
                return false;
            }
        }
        if (this.isReady) {
            return true;
        }
        return this.syncWorkspace(filePaths);
    }

    /** Open then soft-sync all `.rq` files under the workspace root. */
    async activate(): Promise<void> {
        await this.open();
        const ok = await this.syncWorkspace();
        if (!ok) {
            const lastError = this.getStatusSnapshot().lastError;
            throw new Error(lastError?.cause ?? lastError?.summary ?? 'Workspace sync failed');
        }
    }

    async deactivate(): Promise<void> {
        const native = this.native;
        if (native?.canDispatchIndex('deactivate')) {
            native.dispatchIndex('deactivate');
        }
        await this.sqlite?.close();
        this.sqlite = undefined;
        await this.diagnostics?.close();
        this.diagnostics = undefined;
        // Return the FSM to `uninitialized` before dropping the runtime handle.
        // shutdown checkpoints WAL so `.sqlite` / sidecars can be deleted.
        // rq:["../../../../reqlan rq/extension/sqlite-artifact-lifecycle.rq".sqlite_artifact_lifecycle]
        if (native?.canDispatchIndex('closed')) {
            native.dispatchIndex('closed');
        }
        native?.close();
        this.native = undefined;
        this.notifyStatusUpdated();
    }

    async syncWorkspace(filePaths?: string[], trigger?: IndexTimingTrigger): Promise<boolean> {
        if (trigger) {
            this.nextTimingTrigger = trigger;
        }
        if (this.syncInFlight) {
            return this.syncInFlight;
        }
        this.syncCancelRequested = false;
        this.syncInFlight = this.runSyncWorkspace(filePaths).finally(() => {
            this.syncInFlight = undefined;
            this.syncCancelRequested = false;
            this.nextTimingTrigger = 'soft_sync';
        });
        return this.syncInFlight;
    }

    /** Request cancellation of an in-flight soft sync; already-indexed rows are kept. */
    cancelSync(): void {
        if (!this.syncInFlight) {
            return;
        }
        this.syncCancelRequested = true;
        this.native?.cancelSync();
    }

    /**
     * Cheap staleness pass: one SQLite mtime map, index only dirty paths, batch-drop deleted docs.
     * No sync state / progress UI when nothing is stale.
     */
    async checkStaleFiles(filePaths: string[]): Promise<IdleCheckResult> {
        if (!this.sqlite) {
            return { checked: 0, indexed: 0, removed: 0 };
        }
        return runStaleCheck(
            {
                sqlite: this.sqlite,
                toIndexedUri: path => this.toIndexedUri(path),
                removeDocuments: uris => this.removeDocuments(uris),
                syncWorkspace: paths => this.syncWorkspace(paths, 'stale'),
                syncInFlight: Boolean(this.syncInFlight)
            },
            filePaths
        );
    }

    async clearAndRebuildIndex(filePaths?: string[]): Promise<boolean> {
        if (this.syncInFlight) {
            this.syncCancelRequested = true;
            this.native?.cancelSync();
            await this.syncInFlight;
        }
        const native = this.native;
        try {
            native?.clearIdeas();
            if (this.sqlite) {
                await this.sqlite.clearAll();
            }
        } catch (error) {
            native?.dispatchIndex('fail');
            native?.recordIndexError('Failed to clear idea index for rebuild', {
                phase: 'open',
                cause: errorCauseMessage(error)
            });
            this.notifyStatusUpdated();
            return false;
        }

        native?.clearFileIssues();
        native?.clearLastError();
        native?.setIndexReady(0, 0);
        native?.clearActivity();
        this.notifyCatalogUpdated();
        this.notifyStatusUpdated();
        this.nextTimingTrigger = 'rebuild';
        return this.syncWorkspace(filePaths);
    }

    async indexFilePath(filePath: string): Promise<void> {
        if (!this.sqlite || !this.native) {
            return;
        }
        const startedAt = new Date().toISOString();
        const result = await this.indexNativeFile(filePath);
        if (!this.diagnostics) {
            return;
        }
        try {
            await this.diagnostics.recordSyncRun({
                trigger: 'enqueue',
                startedAt,
                finishedAt: new Date().toISOString(),
                durationMs: result.durationMs,
                totalFiles: 1,
                skippedMtime: result.outcome === 'mtime_skip' ? 1 : 0,
                indexedFiles: result.outcome === 'error' ? 0 : 1,
                errorFiles: result.outcome === 'error' ? 1 : 0,
                cancelled: false,
                sumFileDurationMs: result.durationMs,
                avgPathDepth: result.pathDepth,
                files: [result]
            });
        } catch {
            // ignore diagnostics failures
        }
    }

    async getIndexDiagnosticsOverview(): Promise<IndexDiagnosticsOverview | undefined> {
        return this.diagnostics?.getOverview();
    }

    async listIndexDiagnosticRuns(limit = 20): Promise<IndexSyncRunSummary[]> {
        if (!this.diagnostics) {
            return [];
        }
        return this.diagnostics.listRecentRuns(limit);
    }

    async listIndexDiagnosticFileTimings(
        runId: number,
        options?: { limit?: number; order?: 'duration_desc' | 'duration_asc' | 'path' }
    ): Promise<IndexFileTimingRow[]> {
        if (!this.diagnostics) {
            return [];
        }
        return this.diagnostics.listFileTimings(runId, options);
    }

    async getIndexDiagnosticRun(runId: number): Promise<IndexSyncRunSummary | undefined> {
        return this.diagnostics?.getRun(runId);
    }

    async removeDocument(indexedUri: string): Promise<void> {
        await this.removeDocuments([indexedUri]);
    }

    /**
     * Explicit old→new index migrate so renamed .rq files do not leave duplicate idea rows.
     */
    async migrateRenamedFile(oldIndexedUri: string, newFilePath: string | undefined): Promise<void> {
        this.native?.recordWorkspaceChange(oldIndexedUri, 'deleted');
        if (newFilePath) {
            this.native?.recordWorkspaceChange(this.toIndexedUri(newFilePath), 'created');
        }
        this.syncQueue = this.syncQueue.then(async () => {
            if (!this.sqlite) {
                return;
            }
            await this.sqlite.removeDocument(oldIndexedUri);
            this.native?.clearFileIssuesForFile(oldIndexedUri);
            if (newFilePath?.endsWith('.rq')) {
                await this.indexFilePath(newFilePath);
            }
            const counts = await this.sqlite.counts();
            this.native?.setIndexReady(counts.ideas, counts.edges);
            this.notifyCatalogUpdated();
            this.notifyStatusUpdated();
        });
        await this.syncQueue;
    }

    enqueueIndex(filePath: string, change: 'created' | 'changed'): void {
        const indexedUri = this.toIndexedUri(filePath);
        this.native?.recordWorkspaceChange(indexedUri, change);
        this.syncQueue = this.syncQueue.then(async () => {
            if (this.syncInFlight) {
                await this.syncInFlight;
            }
            const native = this.native;
            if (!native || !native.canDispatchIndex('sync')) {
                return;
            }
            native.dispatchIndex('sync');
            this.notifyStatusUpdated();
            try {
                await this.indexFilePath(filePath);
                if (this.sqlite) {
                    const counts = await this.sqlite.counts();
                    native.setIndexReady(counts.ideas, counts.edges);
                }
                native.dispatchIndex('synced');
            } catch (error) {
                recordCaughtFileIssue(
                    (fileUri, issues) => native.recordFileIssues(fileUri, issues),
                    indexedUri,
                    error,
                    `Failed to index ${this.relativePath(indexedUri)}`
                );
                native.dispatchIndex('synced');
            } finally {
                this.notifyStatusUpdated();
            }
        });
    }

    enqueueDelete(filePathOrIndexedUri: string): void {
        const indexedUri = this.toIndexedUri(filePathOrIndexedUri);
        this.native?.recordWorkspaceChange(indexedUri, 'deleted');
        this.syncQueue = this.syncQueue.then(async () => {
            await this.removeDocument(indexedUri);
        });
    }

    relativePath(fileUri: string): string {
        if (!this.workspaceRoot) {
            return fileUri;
        }
        if (!fileUri.startsWith('file://') && !fileUri.startsWith('/') && !/^[A-Za-z]:/.test(fileUri)) {
            return fileUri;
        }
        try {
            const filePath = fileUri.startsWith('file://') ? fsPathFromFileUri(fileUri) : fileUri;
            return relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
        } catch {
            return fileUri;
        }
    }

    resolveFileUri(pathInput: string): string {
        return resolveWorkspaceFileUri(pathInput, this.workspaceRoot || undefined);
    }

    listRqFiles(pathPrefix = ''): string[] {
        return [...this.rqFilePaths]
            .map(filePath => relative(this.workspaceRoot, filePath))
            .filter(relativePath => !pathPrefix || relativePath.includes(pathPrefix))
            .sort((left, right) => left.localeCompare(right));
    }

    toIndexedUri(filePathOrUri: string): string {
        if (!this.workspaceRoot) {
            return filePathOrUri.startsWith('file://')
                ? fsPathFromFileUri(filePathOrUri)
                : filePathOrUri;
        }
        const filePath = filePathOrUri.startsWith('file://')
            ? fsPathFromFileUri(filePathOrUri)
            : filePathOrUri;
        return toWorkspaceRelativePath(filePath, this.workspaceRoot);
    }

    private async runSyncWorkspace(filePaths?: string[]): Promise<boolean> {
        const native = this.native;
        if (!this.sqlite || !native) {
            return false;
        }
        const ok = await runSoftSync(
            {
                sqlite: this.sqlite,
                native,
                toIndexedUri: path => this.toIndexedUri(path),
                relativePath: uri => this.relativePath(uri),
                indexFile: filePath => this.indexNativeFile(filePath),
                collectRqFiles: () => this.collectRqFiles(),
                setRqFilePaths: paths => {
                    this.rqFilePaths = paths;
                },
                isReady: () => this.isReady,
                getCancelRequested: () => this.syncCancelRequested,
                setSyncProgress: progress => this.setSyncProgress(progress),
                notifyStatusUpdated: () => this.notifyStatusUpdated(),
                notifyCatalogUpdated: () => this.notifyCatalogUpdated(),
                waitForReadyOrError: () => this.waitForReadyOrError(),
                diagnostics: this.diagnostics,
                timingTrigger: this.nextTimingTrigger
            },
            filePaths
        );
        // Full-base sync also indexes comment-bearing code files (mtime-skips .rq already done).
        if (ok && !filePaths?.length && !this.syncCancelRequested) {
            try {
                native.syncWorkspace(false);
                const counts = await this.sqlite.counts();
                native.setIndexReady(counts.ideas, counts.edges);
            } catch {
                // Code-file catch-up must not fail the .rq sync.
            }
        }
        return ok;
    }

    private async indexNativeFile(filePath: string): Promise<IndexOneFileResult> {
        const started = performance.now();
        const indexedUri = this.toIndexedUri(filePath);
        const pathDepth = pathDepthFromUri(indexedUri);
        const finish = (outcome: IndexOneFileResult['outcome']): IndexOneFileResult => ({
            fileUri: indexedUri,
            durationMs: performance.now() - started,
            outcome,
            pathDepth
        });
        const native = this.native;
        if (!this.sqlite || !native) {
            return finish('error');
        }
        const hashBefore = await this.sqlite.getDocumentHash(indexedUri);
        let diagnostics: string[] = [];
        try {
            diagnostics = native.indexFile(filePath).diagnostics;
        } catch (error) {
            recordCaughtFileIssue(
                (fileUri, issues) => native.recordFileIssues(fileUri, issues),
                indexedUri,
                error,
                `Failed to index ${this.relativePath(indexedUri)}`
            );
            return finish('error');
        }
        if (diagnostics.length > 0) {
            native.recordFileIssues(
                indexedUri,
                diagnostics.map(message => ({
                    line: 0,
                    column: 0,
                    message,
                    phase: 'parse' as const
                }))
            );
        } else {
            native.clearFileIssuesForFile(indexedUri);
        }
        const hashAfter = await this.sqlite.getDocumentHash(indexedUri);
        const ideas = await this.sqlite.getIdeasInFile(indexedUri);
        const persisted = ideas.filter(idea => idea.kind !== 'ideaset');
        if (diagnostics.length > 0 && persisted.length === 0) {
            return finish('error');
        }
        if (hashBefore !== undefined && hashBefore === hashAfter && diagnostics.length === 0) {
            return finish('hash_skip');
        }
        native.recordDocumentUpdate(
            indexedUri,
            persisted.length,
            persisted.map(idea => ({
                id: idea.id,
                name: idea.name,
                lineStart: idea.lineStart
            }))
        );
        this.notifyCatalogUpdated();
        return finish(diagnostics.length > 0 ? 'error' : 'persisted');
    }

    private setSyncProgress(progress: IndexSyncProgress | undefined): void {
        this.native?.setSyncProgress(progress);
    }

    private async removeDocuments(indexedUris: string[]): Promise<void> {
        if (!this.sqlite || indexedUris.length === 0) {
            return;
        }
        await this.sqlite.removeDocuments(indexedUris);
        for (const indexedUri of indexedUris) {
            this.native?.clearFileIssuesForFile(indexedUri);
        }
        const counts = await this.sqlite.counts();
        this.native?.setIndexReady(counts.ideas, counts.edges);
        this.notifyCatalogUpdated();
        this.notifyStatusUpdated();
    }

    private async waitForReadyOrError(timeoutMs = 120_000): Promise<boolean> {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const state = this.state;
            if (state === 'ready') {
                return true;
            }
            if (state === 'error') {
                return false;
            }
            await delay(100);
        }
        return this.isReady;
    }

    private async collectRqFiles(): Promise<string[]> {
        // Reload so edits to `.reqlan/.rqignore` apply on the next sync/walk.
        this.rqIgnore = loadRqIgnore(this.workspaceRoot);
        const results: string[] = [];
        if (this.workspaceRoot) {
            await this.walkDirectory(this.workspaceRoot, results);
        }
        this.rqFilePaths = results;
        return results;
    }

    private async walkDirectory(directory: string, results: string[]): Promise<void> {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (isIgnoredPath(this.rqIgnore, this.workspaceRoot, fullPath, true)) {
                    continue;
                }
                await this.walkDirectory(fullPath, results);
                continue;
            }
            if (
                entry.isFile()
                && entry.name.endsWith('.rq')
                && !isSecretRqPath(entry.name)
                && !isIgnoredPath(this.rqIgnore, this.workspaceRoot, fullPath, false)
            ) {
                results.push(fullPath);
            }
        }
    }

    private notifyCatalogUpdated(): void {
        for (const listener of this.catalogListeners) {
            listener();
        }
    }

    private notifyStatusUpdated(): void {
        for (const listener of this.statusListeners) {
            listener();
        }
    }
}

/** Alias kept for CLI/MCP call sites and existing imports. */
export { WorkspaceIndex as HeadlessIndexService };

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

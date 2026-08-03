/**
 * Host-agnostic workspace ideas index: parse → extract → SQLite.
 * VS Code / CLI / MCP supply file lists and path display; this owns indexing.
 *
 * Public methods are the semantic surface; sync/file/mtime details live in:
 * - workspace-index-sync.ts
 * - workspace-index-file.ts
 * - workspace-mtime.ts
 *
 * rq:["../../../reqlan rq/indexer/indexer.rq".index]
 * rq:["../../../reqlan rq/indexer/indexer.rq".ownership]
 * rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".index_ideas]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_incrementality]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_auto]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_open]
 * rq:["../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_metrics]
 * rq:["../../../reqlan rq/indexer/indexer.rq".index_diagnostics_timing]
 */
import { URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createReqlanServices } from '@reqlan/language';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { AnalyticalStore } from '../core/analytical-store.js';
import { IDEAS_INDEX_FILENAME, INDEX_DIAGNOSTICS_FILENAME } from '../core/application-memory.js';
import { toFileIndexIssueView, toIndexErrorDetail } from '../core/index-error.js';
import { isIgnoredPath, loadRqIgnore, type RqIgnoreFilter } from '../core/rqignore.js';
import { resolveWorkspaceFileUri, toWorkspaceRelativePath } from '../core/workspace-paths.js';
import { isSecretRqPath } from '../export/secret-rq.js';
import {
    IndexDiagnosticsStore,
    type IndexDiagnosticsOverview,
    type IndexFileTimingRow,
    type IndexSyncRunSummary,
    type IndexTimingTrigger
} from './index-diagnostics-store.js';
import { recordCaughtFileIssue } from './index-file-error.js';
import type { IndexStatusSnapshot, IndexSyncProgress } from './index-status.js';
import { SqliteIndexStore } from './sqlite-store.js';
import { indexOneFile } from './workspace-index-file.js';
import {
    checkStaleFiles as runStaleCheck,
    runSoftSync,
    type IdleCheckResult
} from './workspace-index-sync.js';

export type { IndexStatusSnapshot, IndexSyncProgress } from './index-status.js';
export type { IdleCheckResult } from './workspace-index-sync.js';

export class WorkspaceIndex {
    private sqlite?: SqliteIndexStore;
    private diagnostics?: IndexDiagnosticsStore;
    private readonly services = createReqlanServices({ ...NodeFileSystem });
    private syncQueue = Promise.resolve();
    private syncInFlight?: Promise<boolean>;
    private syncProgress?: IndexSyncProgress;
    private syncCancelRequested = false;
    private nextTimingTrigger: IndexTimingTrigger = 'soft_sync';
    private readonly catalogListeners = new Set<() => void>();
    private readonly statusListeners = new Set<() => void>();
    private rqFilePaths: string[] = [];
    private rqIgnore: RqIgnoreFilter;

    constructor(
        private readonly analytical: AnalyticalStore,
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

    get state() {
        return this.analytical.getState().indexState;
    }

    get isReady(): boolean {
        return this.analytical.getState().indexState === 'ready';
    }

    get indexStore(): SqliteIndexStore {
        if (!this.sqlite) {
            throw new Error('Index store is not open');
        }
        return this.sqlite;
    }

    getStatusSnapshot(relativePath: (uri: string) => string = uri => this.relativePath(uri)): IndexStatusSnapshot {
        const storeState = this.analytical.getState();
        return {
            state: storeState.indexState,
            ready: storeState.indexState === 'ready',
            ideaCount: storeState.ideaCount,
            edgeCount: storeState.edgeCount,
            fileIssueCount: storeState.fileIndexIssues.length,
            lastError: storeState.lastError
                ? toIndexErrorDetail(storeState.lastError, relativePath)
                : undefined,
            fileIssues: storeState.fileIndexIssues.map(issue => toFileIndexIssueView(issue, relativePath)),
            syncProgress: this.syncProgress,
            recentDocumentUpdates: [...storeState.documentUpdates].reverse().slice(0, 10),
            recentWorkspaceChanges: [...storeState.workspaceChanges].reverse().slice(0, 10)
        };
    }

    /** Open the SQLite store (does not sync). Idempotent when already open. */
    async open(): Promise<void> {
        if (this.sqlite) {
            const state = this.state;
            if (state === 'idle' || state === 'ready' || state === 'syncing' || state === 'opening') {
                return;
            }
        }
        const { canDispatchIndex, dispatchIndex, recordIndexError } = this.analytical.getState();
        if (!canDispatchIndex('activate')) {
            if (this.sqlite && (this.state === 'idle' || this.state === 'ready' || this.state === 'syncing')) {
                return;
            }
            recordIndexError(`Cannot open idea index from state ${this.state}`, undefined, { phase: 'open' });
            this.notifyStatusUpdated();
            throw new Error(`Cannot open idea index from state ${this.state}`);
        }
        dispatchIndex('activate');
        try {
            const dbPath = join(this.storagePath, IDEAS_INDEX_FILENAME);
            this.sqlite = await SqliteIndexStore.open(dbPath);
            try {
                const diagnosticsPath = join(this.storagePath, INDEX_DIAGNOSTICS_FILENAME);
                this.diagnostics = await IndexDiagnosticsStore.open(diagnosticsPath);
            } catch {
                this.diagnostics = undefined;
            }
            dispatchIndex('opened');
            this.notifyStatusUpdated();
        } catch (error) {
            dispatchIndex('fail');
            recordIndexError('Failed to open idea index', error, { phase: 'open' });
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
            const lastError = this.analytical.getState().lastError;
            throw lastError?.cause instanceof Error
                ? lastError.cause
                : new Error(lastError?.message ?? 'Workspace sync failed');
        }
    }

    async deactivate(): Promise<void> {
        const analytical = this.analytical.getState();
        if (analytical.canDispatchIndex('deactivate')) {
            analytical.dispatchIndex('deactivate');
        }
        await this.sqlite?.close();
        this.sqlite = undefined;
        await this.diagnostics?.close();
        this.diagnostics = undefined;
        if (this.analytical.getState().canDispatchIndex('closed')) {
            this.analytical.getState().dispatchIndex('closed');
        }
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
            await this.syncInFlight;
        }
        const dbPath = join(this.storagePath, IDEAS_INDEX_FILENAME);
        const analytical = this.analytical.getState();

        if (this.sqlite) {
            this.sqlite.closeWithoutPersist();
            this.sqlite = undefined;
        }
        await SqliteIndexStore.deleteDatabaseFile(dbPath);

        try {
            this.sqlite = await SqliteIndexStore.open(dbPath);
        } catch (error) {
            analytical.dispatchIndex('fail');
            analytical.recordIndexError('Failed to reopen idea index after reset', error, { phase: 'open' });
            this.notifyStatusUpdated();
            return false;
        }

        analytical.clearFileIndexIssues();
        analytical.clearLastError();
        analytical.setIndexReady({ ideaCount: 0, edgeCount: 0 });
        this.analytical.setState({
            documentUpdates: [],
            workspaceChanges: []
        });
        this.notifyCatalogUpdated();
        this.notifyStatusUpdated();
        this.nextTimingTrigger = 'rebuild';
        return this.syncWorkspace(filePaths);
    }

    async indexFilePath(filePath: string): Promise<void> {
        if (!this.sqlite) {
            return;
        }
        const startedAt = new Date().toISOString();
        const wallStarted = performance.now();
        const result = await indexOneFile(this.indexFileDeps(), filePath);
        if (!this.diagnostics) {
            return;
        }
        try {
            await this.diagnostics.recordSyncRun({
                trigger: 'enqueue',
                startedAt,
                finishedAt: new Date().toISOString(),
                durationMs: performance.now() - wallStarted,
                totalFiles: 1,
                skippedMtime: 0,
                indexedFiles: 1,
                errorFiles: result.outcome === 'error' ? 1 : 0,
                cancelled: false,
                sumFileDurationMs: result.durationMs,
                avgPathDepth: result.pathDepth,
                files: [{
                    fileUri: result.fileUri,
                    durationMs: result.durationMs,
                    outcome: result.outcome,
                    pathDepth: result.pathDepth
                }]
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
        this.analytical.getState().recordWorkspaceChange(oldIndexedUri, 'deleted');
        if (newFilePath) {
            this.analytical.getState().recordWorkspaceChange(this.toIndexedUri(newFilePath), 'created');
        }
        this.syncQueue = this.syncQueue.then(async () => {
            if (!this.sqlite) {
                return;
            }
            await this.sqlite.removeDocument(oldIndexedUri);
            this.analytical.getState().clearFileIndexIssuesForFile(oldIndexedUri);
            if (newFilePath?.endsWith('.rq')) {
                await this.indexFilePath(newFilePath);
            }
            const counts = await this.sqlite.counts();
            this.analytical.getState().setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
            this.notifyCatalogUpdated();
            this.notifyStatusUpdated();
        });
        await this.syncQueue;
    }

    enqueueIndex(filePath: string, change: 'created' | 'changed'): void {
        const indexedUri = this.toIndexedUri(filePath);
        this.analytical.getState().recordWorkspaceChange(indexedUri, change);
        this.syncQueue = this.syncQueue.then(async () => {
            if (this.syncInFlight) {
                await this.syncInFlight;
            }
            const analytical = this.analytical.getState();
            if (!analytical.canDispatchIndex('sync')) {
                return;
            }
            analytical.dispatchIndex('sync');
            this.notifyStatusUpdated();
            try {
                await this.indexFilePath(filePath);
                if (this.sqlite) {
                    const counts = await this.sqlite.counts();
                    analytical.setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
                }
                analytical.dispatchIndex('synced');
            } catch (error) {
                recordCaughtFileIssue(
                    analytical.recordFileIndexIssues,
                    indexedUri,
                    error,
                    `Failed to index ${this.relativePath(indexedUri)}`
                );
                analytical.dispatchIndex('synced');
            } finally {
                this.notifyStatusUpdated();
            }
        });
    }

    enqueueDelete(filePathOrIndexedUri: string): void {
        const indexedUri = this.toIndexedUri(filePathOrIndexedUri);
        this.analytical.getState().recordWorkspaceChange(indexedUri, 'deleted');
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
            const filePath = fileUri.startsWith('file://') ? URI.parse(fileUri).fsPath : fileUri;
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
                ? URI.parse(filePathOrUri).fsPath
                : filePathOrUri;
        }
        const filePath = filePathOrUri.startsWith('file://')
            ? URI.parse(filePathOrUri).fsPath
            : filePathOrUri;
        return toWorkspaceRelativePath(filePath, this.workspaceRoot);
    }

    private async runSyncWorkspace(filePaths?: string[]): Promise<boolean> {
        if (!this.sqlite) {
            return false;
        }
        return runSoftSync(
            {
                sqlite: this.sqlite,
                analytical: this.analytical,
                toIndexedUri: path => this.toIndexedUri(path),
                relativePath: uri => this.relativePath(uri),
                indexFileDeps: this.indexFileDeps(),
                collectRqFiles: () => this.collectRqFiles(),
                setRqFilePaths: paths => {
                    this.rqFilePaths = [...paths];
                },
                isReady: () => this.isReady,
                getCancelRequested: () => this.syncCancelRequested,
                setSyncProgress: progress => {
                    this.syncProgress = progress;
                },
                notifyStatusUpdated: () => this.notifyStatusUpdated(),
                notifyCatalogUpdated: () => this.notifyCatalogUpdated(),
                waitForReadyOrError: () => this.waitForReadyOrError(),
                diagnostics: this.diagnostics,
                timingTrigger: this.nextTimingTrigger
            },
            filePaths
        );
    }

    private indexFileDeps() {
        if (!this.sqlite) {
            throw new Error('Index store is not open');
        }
        return {
            sqlite: this.sqlite,
            analytical: this.analytical,
            workspaceRoot: this.workspaceRoot,
            toIndexedUri: (filePath: string) => this.toIndexedUri(filePath),
            parseDocument: (filePath: string) => this.parseDocument(filePath),
            notifyCatalogUpdated: () => this.notifyCatalogUpdated()
        };
    }

    private async removeDocuments(indexedUris: string[]): Promise<void> {
        if (!this.sqlite || indexedUris.length === 0) {
            return;
        }
        const analytical = this.analytical.getState();
        await this.sqlite.removeDocuments(indexedUris);
        for (const indexedUri of indexedUris) {
            analytical.clearFileIndexIssuesForFile(indexedUri);
        }
        const counts = await this.sqlite.counts();
        analytical.setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
        this.notifyCatalogUpdated();
        this.notifyStatusUpdated();
    }

    private async waitForReadyOrError(timeoutMs = 120_000): Promise<boolean> {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const state = this.analytical.getState().indexState;
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

    private async parseDocument(filePath: string): Promise<LangiumDocument> {
        const text = await readFile(filePath, 'utf8');
        const langiumUri = URI.file(filePath);
        const document = this.services.shared.workspace.LangiumDocumentFactory.fromString(text, langiumUri);
        await this.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        return document;
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

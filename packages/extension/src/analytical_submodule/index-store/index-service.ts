/**
 * VS Code host adapter over multi-base {@link BaseRegistry} / {@link WorkspaceIndex}.
 * Owns file watching, Uri conversion, and create-base onboarding; indexing lives in `@reqlan/analytical`.
 *
 * SQLite artifacts are opened for event-driven work and released when idle — the adapter does not
 * keep permanent connections or a second long-lived AnalysisApi cache.
 * rq:["../../../../../reqlan rq/extension/index-host/sqlite-artifact-lifecycle.rq".sqlite_artifact_lifecycle]
 * rq:["../../../../../reqlan rq/extension/index-host/sqlite-artifact-lifecycle.rq".release_when_idle]
 * rq:["../../../../../reqlan rq/extension/index-host/sqlite-artifact-lifecycle.rq".event_driven_base_access]
 * rq:["../../../../../reqlan rq/extension/index-host/sqlite-artifact-lifecycle.rq".analysis_api_dispose]
 */
import * as vscode from 'vscode';
import {
    BaseRegistry,
    baseForPath,
    clampScanLimits,
    createBase as createBaseMarker,
    DEFAULT_SCAN_MAX_DEPTH,
    DEFAULT_SCAN_MAX_ENTRIES,
    isIgnoredPath,
    isPathInsideOrEqual,
    loadRqIgnore,
    openAnalysisApi,
    resolveApplicationMemoryPath,
    scanWorkspace,
    toBaseDescriptor,
    type BaseDescriptor,
    type BaseStatusEntry,
    type IndexStatusSnapshot,
    type NativeAnalysisApi,
    type RegisteredBase,
    type WorkspaceScan
} from '@reqlan/analytical';
import { toIndexFileUri } from './resolve-index-file-uri.js';
import { shareInFlight, type InFlightSlot } from '../../shared/share-in-flight.js';
import { PendingRenamePaths } from './pending-rename-paths.js';
import { StartupGate } from '../../extension/startup-gate.js';

export type { IndexStatusSnapshot, IndexSyncProgress } from '@reqlan/analytical';
export type { BaseDescriptor, BaseStatusEntry, RegisteredBase };

const EMPTY_STATUS: IndexStatusSnapshot = {
    state: 'uninitialized',
    ready: false,
    ideaCount: 0,
    edgeCount: 0,
    fileIssueCount: 0,
    fileIssues: [],
    recentDocumentUpdates: [],
    recentWorkspaceChanges: []
};

/** Quiet period after index activity before idle stale check + artifact release. */
const IDLE_QUIET_MS = 45_000;
/** Sooner release when the window loses focus. */
const IDLE_UNFOCUSED_MS = 10_000;

export class IndexService {
    private readonly registry = new BaseRegistry();
    private watcher?: vscode.FileSystemWatcher;
    private codeWatcher?: vscode.FileSystemWatcher;
    private markerWatcher?: vscode.FileSystemWatcher;
    private activeBaseId?: string;
    private readonly catalogListeners = new Set<() => void>();
    private readonly statusListeners = new Set<() => void>();
    private registryCatalogUnsub?: () => void;
    private registryStatusUnsub?: () => void;
    private promptedCreateBase = false;
    private idleTimer?: ReturnType<typeof setTimeout>;
    private idleCheckInFlight = false;
    private idleSyncActive = false;
    /** Coalesced open+soft-sync nudges keyed by base id (pin / path activate). */
    private readonly catchUpInFlight = new Map<string, Promise<void>>();
    /** One in-flight native scan so overlapping rediscover/sync do not walk twice. */
    private readonly scanSlot: InFlightSlot<WorkspaceScan> = {};
    private lastBaseRoots: string[] = [];
    private lastScan?: WorkspaceScan;
    private readonly baseRootListeners = new Set<(roots: string[]) => void>();
    /**
     * Rename old→new paths while `onDidRenameFiles` plans import rewrites.
     * Watcher delete would otherwise clear the pre-move index URI first.
     */
    /** Resolves when the workspace index has opened its native store (before sync). */
    readonly indexOpened = new StartupGate();
    private readonly pendingRenames = new PendingRenamePaths();
    private pendingRenameClearTimer?: ReturnType<typeof setTimeout>;

    get discoveryEmpty(): boolean {
        return this.registry.size === 0;
    }

    listBases(): BaseDescriptor[] {
        return this.registry.list();
    }

    getActiveBase(): RegisteredBase | undefined {
        if (this.activeBaseId) {
            const entry = this.registry.get(this.activeBaseId);
            if (entry) {
                return entry;
            }
        }
        return this.registry.selectDefault(this.activeEditorPath());
    }

    getActiveBaseId(): string | undefined {
        return this.getActiveBase()?.descriptor.id;
    }

    /**
     * Pin the active base. Pointer swap only — does not await indexing.
     * If the selected store is not ready, schedules the shared activate catch-up
     * path (open + soft sync) without blocking the switcher.
     */
    setActiveBaseId(baseId: string | undefined): void {
        if (baseId && !this.registry.get(baseId)) {
            return;
        }
        const previous = this.activeBaseId;
        this.activeBaseId = baseId;
        this.notifyStatus();
        this.notifyCatalog();
        if (previous && previous !== baseId) {
            void this.releaseBase(previous);
        }
        if (baseId) {
            this.scheduleBaseCatchUp(baseId);
        }
    }

    /** Resolve active base from a file path (longest match) and optionally pin it. */
    activateBaseForPath(absPath: string, pin = true): RegisteredBase | undefined {
        const match = baseForPath(this.listBases(), absPath);
        if (match && pin) {
            const previous = this.activeBaseId;
            this.activeBaseId = match.id;
            if (previous && previous !== match.id) {
                void this.releaseBase(previous);
            }
            this.scheduleBaseCatchUp(match.id);
        }
        return match ? this.registry.get(match.id) : undefined;
    }

    getRegistered(baseId: string): RegisteredBase | undefined {
        return this.registry.get(baseId);
    }

    statusByBase(): BaseStatusEntry[] {
        return this.registry.statusByBase(uri => vscode.workspace.asRelativePath(uri));
    }

    subscribeCatalogUpdates(listener: () => void): () => void {
        this.catalogListeners.add(listener);
        return () => {
            this.catalogListeners.delete(listener);
        };
    }

    getBaseRoots(): string[] {
        return this.lastBaseRoots;
    }

    subscribeBaseRoots(listener: (roots: string[]) => void): () => void {
        this.baseRootListeners.add(listener);
        return () => {
            this.baseRootListeners.delete(listener);
        };
    }

    subscribeStatusUpdates(listener: () => void): () => void {
        this.statusListeners.add(listener);
        return () => {
            this.statusListeners.delete(listener);
        };
    }

    get state() {
        return this.getActiveBase()?.index.state ?? 'uninitialized';
    }

    get isReady(): boolean {
        return this.getActiveBase()?.index.isReady ?? false;
    }

    get indexStore() {
        const entry = this.getActiveBase();
        if (!entry) {
            throw new Error('No reqlan base is active. Create a .reqlan folder to initialize a base.');
        }
        return entry.index.indexStore;
    }

    fuzzySearch(
        query: string,
        options?: { limit?: number; requireQuery?: boolean; offset?: number }
    ) {
        const entry = this.getActiveBase();
        if (!entry?.index.isReady) {
            throw new Error('Index is not ready yet.');
        }
        this.scheduleIdleRelease(IDLE_QUIET_MS);
        return entry.index.fuzzySearch(query, options);
    }

    /**
     * Native git-dates fill for the active base (all missing when `ideaIds` omitted).
     * rq:["../../../../../reqlan rq/indexer/indexer.rq".git_dates]
     */
    fillGitDates(ideaIds?: string[]): number {
        const entry = this.getActiveBase();
        if (!entry?.index.isReady) {
            return 0;
        }
        this.scheduleIdleRelease(IDLE_QUIET_MS);
        return entry.index.fillGitDates(ideaIds);
    }

    /**
     * Native Ideas Summary overview coverage for the active base.
     * rq:["../../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".overview_coverage_scores]
     */
    computeOverviewCoverage() {
        const entry = this.getActiveBase();
        if (!entry?.index.isReady) {
            throw new Error('Index is not ready yet.');
        }
        this.scheduleIdleRelease(IDLE_QUIET_MS);
        return entry.index.computeOverviewCoverage();
    }

    /**
     * Run analysis against a base via the analytical package, then dispose.
     * Does not cache a long-lived AnalysisApi connection.
     */
    async withAnalysisApi<T>(
        run: (api: NativeAnalysisApi) => Promise<T>,
        baseId?: string
    ): Promise<T> {
        const entry = baseId ? this.registry.get(baseId) : this.getActiveBase();
        if (!entry) {
            throw new Error('No reqlan base is active. Create a .reqlan folder to initialize a base.');
        }
        const opened = await openAnalysisApi({
            workspaceRoot: entry.descriptor.root,
            storagePath: resolveApplicationMemoryPath(entry.descriptor.root)
        });
        try {
            return await run(opened.api);
        } finally {
            await opened.dispose();
            this.scheduleIdleRelease(IDLE_QUIET_MS);
        }
    }

    getStatusSnapshot(baseId?: string): IndexStatusSnapshot {
        if (this.discoveryEmpty) {
            return { ...EMPTY_STATUS };
        }
        const entry = baseId
            ? this.registry.get(baseId)
            : this.getActiveBase();
        if (!entry) {
            return { ...EMPTY_STATUS };
        }
        return entry.index.getStatusSnapshot(uri => vscode.workspace.asRelativePath(uri));
    }

    async getIndexDiagnosticsOverview(baseId?: string) {
        const entry = baseId ? this.registry.get(baseId) : this.getActiveBase();
        return entry?.index.getIndexDiagnosticsOverview();
    }

    async listIndexDiagnosticRuns(limit = 20, baseId?: string) {
        const entry = baseId ? this.registry.get(baseId) : this.getActiveBase();
        if (!entry) {
            return [];
        }
        return entry.index.listIndexDiagnosticRuns(limit);
    }

    async getIndexDiagnosticRun(runId: number, baseId?: string) {
        const entry = baseId ? this.registry.get(baseId) : this.getActiveBase();
        return entry?.index.getIndexDiagnosticRun(runId);
    }

    async listIndexDiagnosticFileTimings(
        runId: number,
        options?: { limit?: number; order?: 'duration_desc' | 'duration_asc' | 'path' },
        baseId?: string
    ) {
        const entry = baseId ? this.registry.get(baseId) : this.getActiveBase();
        if (!entry) {
            return [];
        }
        return entry.index.listIndexDiagnosticFileTimings(runId, options);
    }

    async activate(context: vscode.ExtensionContext): Promise<void> {
        try {
            await this.rediscoverAndSync(false);

            this.watcher = vscode.workspace.createFileSystemWatcher('**/*.rq');
            this.watcher.onDidCreate(uri => this.enqueueSync(uri, 'created'));
            this.watcher.onDidChange(uri => this.enqueueSync(uri, 'changed'));
            this.watcher.onDidDelete(uri => this.enqueueDelete(uri));
            context.subscriptions.push(this.watcher);

            this.codeWatcher = vscode.workspace.createFileSystemWatcher(
                '**/*.{ts,tsx,js,jsx,mjs,cjs,py,rs,go,java,kt,c,h,cpp,cs,rb,php,swift,vue,svelte,md}'
            );
            this.codeWatcher.onDidCreate(uri => this.enqueueSync(uri, 'created'));
            this.codeWatcher.onDidChange(uri => this.enqueueSync(uri, 'changed'));
            this.codeWatcher.onDidDelete(uri => this.enqueueDelete(uri));
            context.subscriptions.push(this.codeWatcher);

            // Watch the marker directory itself — not children — so SQLite writes do not rediscover.
            this.markerWatcher = vscode.workspace.createFileSystemWatcher('**/.reqlan');
            this.markerWatcher.onDidCreate(() => {
                void this.rediscoverAndSync(true);
            });
            this.markerWatcher.onDidDelete(() => {
                void this.rediscoverAndSync(true);
            });
            context.subscriptions.push(this.markerWatcher);

            context.subscriptions.push(
                vscode.workspace.onDidChangeWorkspaceFolders(() => {
                    void this.rediscoverAndSync(true);
                })
            );

            context.subscriptions.push(
                vscode.window.onDidChangeWindowState(state => {
                    if (!state.focused) {
                        this.scheduleIdleRelease(IDLE_UNFOCUSED_MS);
                        return;
                    }
                    if (this.idleSyncActive) {
                        this.cancelSync();
                    }
                    const activeId = this.getActiveBaseId();
                    if (activeId) {
                        this.scheduleBaseCatchUp(activeId);
                    }
                    this.scheduleIdleRelease(IDLE_QUIET_MS);
                })
            );

            context.subscriptions.push({
                dispose: () => this.clearIdleTimer()
            });

            this.scheduleIdleRelease(IDLE_QUIET_MS);

            if (this.discoveryEmpty) {
                void this.promptCreateBaseIfNeeded();
            }
        } catch {
            // open/sync already recorded errors on per-base stores
        } finally {
            // Never leave the language-server startup gate pending.
            this.indexOpened.signal();
        }
    }

    deactivate(): void {
        this.clearIdleTimer();
        void this.registry.deactivateAll();
        this.rewireRegistryListeners();
        this.watcher?.dispose();
        this.watcher = undefined;
        this.codeWatcher?.dispose();
        this.codeWatcher = undefined;
        this.markerWatcher?.dispose();
        this.markerWatcher = undefined;
        this.activeBaseId = undefined;
    }

    async syncWorkspace(baseId?: string): Promise<boolean> {
        const roots = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
        const scan = await this.scanOnce();
        const files = scanFiles(scan);
        try {
            // Refresh always rediscovers via the analytical registry so new `.reqlan`
            // markers appear even when bases were already registered.
            // rq:["../../../../../reqlan rq/bases/base.rq".refresh_rediscovers_bases]
            const result = await this.registry.refresh(roots, {
                preferredActiveId: baseId ?? this.activeBaseId,
                cwd: this.activeEditorPath(),
                bases: descriptorsFromScan(scan, roots),
                allRqFiles: files,
                syncActive: true
            });
            this.rewireRegistryListeners();
            this.activeBaseId = result.activeId;
            this.notifyStatus();
            this.notifyCatalog();
            if (result.bases.length === 0) {
                return false;
            }
            if (baseId && baseId !== result.activeId) {
                return this.registry.syncBase(baseId, files);
            }
            return result.synced;
        } finally {
            this.scheduleIdleRelease(IDLE_QUIET_MS);
        }
    }

    async clearAndRebuildIndex(baseId?: string): Promise<boolean> {
        const roots = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
        const scan = await this.scanOnce();
        const files = scanFiles(scan);
        try {
            const result = await this.registry.refresh(roots, {
                preferredActiveId: baseId ?? this.activeBaseId,
                cwd: this.activeEditorPath(),
                bases: descriptorsFromScan(scan, roots),
                allRqFiles: files,
                // Rediscover first; rebuild replaces soft-sync for the chosen base.
                syncActive: false
            });
            this.rewireRegistryListeners();
            this.activeBaseId = result.activeId;
            const id = baseId ?? result.activeId;
            if (!id) {
                this.notifyStatus();
                this.notifyCatalog();
                return false;
            }
            const ok = await this.registry.clearAndRebuildBase(id, files);
            this.notifyStatus();
            this.notifyCatalog();
            return ok;
        } finally {
            this.scheduleIdleRelease(IDLE_QUIET_MS);
        }
    }

    cancelSync(baseId?: string): void {
        this.registry.cancelSync(baseId);
    }

    /**
     * Open the active (or given) base for UI/command use, then schedule idle release.
     */
    async ensureOpenForUse(baseId?: string): Promise<boolean> {
        const id = baseId ?? this.getActiveBaseId();
        if (!id) {
            return false;
        }
        const entry = this.registry.get(id);
        if (entry?.index.isReady) {
            this.scheduleIdleRelease(IDLE_QUIET_MS);
            return true;
        }
        const files = await this.filesForSync();
        const ok = await this.registry.ensureBaseReady(id, files);
        this.notifyStatus();
        this.notifyCatalog();
        this.scheduleIdleRelease(IDLE_QUIET_MS);
        return ok;
    }

    /** Background mtime staleness check on bases that are already open; then release unused handles. */
    async checkStaleFiles(): Promise<void> {
        if (this.discoveryEmpty || this.idleCheckInFlight) {
            return;
        }
        this.idleCheckInFlight = true;
        this.idleSyncActive = true;
        try {
            const files = await this.collectStoredPaths();
            for (const base of this.registry.list()) {
                const entry = this.registry.get(base.id);
                // Idle must not open closed bases (no reconnect loop) — only diff already-open stores.
                if (!entry?.index.isReady) {
                    continue;
                }
                const owned = files.filter(filePath => {
                    const match = this.registry.baseForFilePath(filePath);
                    return match?.descriptor.id === base.id;
                });
                await entry.index.checkStaleFiles(owned);
            }
            this.notifyStatus();
            this.notifyCatalog();
        } finally {
            this.idleSyncActive = false;
            this.idleCheckInFlight = false;
            await this.releaseUnusedArtifacts();
        }
    }

    async indexFile(uri: vscode.Uri): Promise<void> {
        const entry = this.registry.baseForFilePath(uri.fsPath);
        if (!entry) {
            return;
        }
        await this.ensureBaseOpen(entry.descriptor.id);
        await entry.index.indexFilePath(uri.fsPath);
        this.scheduleIdleRelease(IDLE_QUIET_MS);
    }

    /**
     * Explicit old→new index migrate so renamed .rq files do not leave duplicate idea rows.
     */
    async migrateRenamedFile(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
        const entry =
            this.registry.baseForFilePath(newUri.fsPath) ??
            this.registry.baseForFilePath(oldUri.fsPath);
        if (!entry) {
            return;
        }
        await this.ensureBaseOpen(entry.descriptor.id);
        await entry.index.migrateRenamedFile(
            toIndexFileUri(oldUri, entry.descriptor.root),
            newUri.fsPath.endsWith('.rq') ? newUri.fsPath : undefined
        );
        this.scheduleIdleRelease(IDLE_QUIET_MS);
    }

    /**
     * Hold watcher delete/create for paths in an in-flight explorer rename so
     * import rewrite planning can still read the pre-move index URI.
     * rq:["../../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
     * rq:["../../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_changes]
     */
    notePendingRenames(files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>): void {
        this.pendingRenames.note(files.map(file => ({
            oldPath: file.oldUri.fsPath,
            newPath: file.newUri.fsPath
        })));
        this.armPendingRenameClearTimer();
    }

    clearPendingRenames(files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>): void {
        this.pendingRenames.clear(files.map(file => ({
            oldPath: file.oldUri.fsPath,
            newPath: file.newUri.fsPath
        })));
        if (this.pendingRenames.isEmpty) {
            this.clearPendingRenameClearTimer();
        }
    }

    /**
     * Create `<folder>/.reqlan/` (empty dir marker), rediscover, and sync.
     * Defaults to the first workspace folder.
     * Uses analytical `createBase` + `BaseRegistry.refresh` so the new marker is
     * always registered and the returned descriptor matches discovery.
     * rq:["../../../../../reqlan rq/bases/base.rq".create_base_onboarding]
     * rq:["../../../../../reqlan rq/bases/base.rq".refresh_rediscovers_bases]
     */
    async createBase(folderUri?: vscode.Uri): Promise<BaseDescriptor | undefined> {
        const folder =
            folderUri ??
            vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!folder) {
            void vscode.window.showWarningMessage('Open a workspace folder to create a reqlan base.');
            return undefined;
        }
        const created = await createBaseMarker(folder.fsPath);
        const roots = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
        const scan = await this.scanOnce();
        const files = scanFiles(scan);
        const result = await this.registry.refresh(roots, {
            preferredActiveId: created.base.id,
            cwd: folder.fsPath,
            bases: descriptorsFromScan(scan, roots),
            allRqFiles: files,
            syncActive: true
        });
        this.rewireRegistryListeners();
        this.activeBaseId = result.activeId ?? created.base.id;
        this.notifyStatus();
        this.notifyCatalog();
        this.scheduleIdleRelease(IDLE_QUIET_MS);
        return this.registry.get(created.base.id)?.descriptor ?? created.base;
    }

    async promptCreateBaseIfNeeded(): Promise<void> {
        if (!this.discoveryEmpty || this.promptedCreateBase) {
            return;
        }
        if (!vscode.workspace.workspaceFolders?.length) {
            return;
        }
        this.promptedCreateBase = true;
        const choice = await vscode.window.showInformationMessage(
            'No reqlan base found. Create a base at the workspace root to enable the ideas index?',
            'Create Base',
            'Not now'
        );
        if (choice === 'Create Base') {
            const created = await this.createBase();
            if (created) {
                void vscode.window.showInformationMessage(`Created reqlan base at ${created.label}`);
            }
        }
    }

    private async rediscoverAndSync(_resync: boolean): Promise<void> {
        const roots = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
        const scan = await this.scanOnce();
        const files = scanFiles(scan);
        // Shared analytical refresh path (same as Refresh buttons).
        const result = await this.registry.refresh(roots, {
            preferredActiveId: this.activeBaseId,
            cwd: this.activeEditorPath(),
            bases: descriptorsFromScan(scan, roots),
            allRqFiles: files,
            syncActive: true,
            onOpened: () => this.indexOpened.signal()
        });
        this.rewireRegistryListeners();
        this.activeBaseId = result.activeId;
        this.notifyStatus();
        this.notifyCatalog();
        this.scheduleIdleRelease(IDLE_QUIET_MS);
    }

    private rewireRegistryListeners(): void {
        this.registryCatalogUnsub?.();
        this.registryStatusUnsub?.();
        this.registryCatalogUnsub = this.registry.subscribeCatalogUpdates(() => this.notifyCatalog());
        this.registryStatusUnsub = this.registry.subscribeStatusUpdates(() => this.notifyStatus());
    }

    /**
     * One native directory walk for the open workspace folders.
     * Overlapping callers share the in-flight scan.
     * rq:["../../../../../reqlan rq/indexer/cache-reuse.rq".single_sync_walk]
     * rq:["../../../../../reqlan rq/indexer/sequencing.rq".scan_limits]
     */
    private async scanOnce(): Promise<WorkspaceScan> {
        return shareInFlight(this.scanSlot, () => this.runScan());
    }

    private async filesForSync(): Promise<string[]> {
        if (this.lastScan) {
            return scanFiles(this.lastScan);
        }
        return scanFiles(await this.scanOnce());
    }

    private async runScan(): Promise<WorkspaceScan> {
        const roots = (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath);
        const configuration = vscode.workspace.getConfiguration('reqlan');
        const limits = clampScanLimits(
            configuration.get<number>('scan.maxDepth', DEFAULT_SCAN_MAX_DEPTH),
            configuration.get<number>('scan.maxEntries', DEFAULT_SCAN_MAX_ENTRIES)
        );
        const scan = await scanWorkspace(roots, limits, false);
        this.lastScan = scan;
        this.lastBaseRoots = scan.bases;
        for (const listener of this.baseRootListeners) {
            listener(scan.bases);
        }
        if (scan.truncated) {
            const reason = scan.truncationReason === 'maxDepth' ? 'depth' : 'entry';
            const message = `reqlan stopped the workspace scan at the ${reason} cap. Raise reqlan.scan.maxDepth or reqlan.scan.maxEntries. The index is partial.`;
            console.warn(`[reqlan] ${message}`);
            void vscode.window.showWarningMessage(message);
        }
        return scan;
    }

    /** Idle stale check uses stored document paths. New files arrive from the watcher. */
    private async collectStoredPaths(): Promise<string[]> {
        const paths: string[] = [];
        for (const base of this.registry.list()) {
            const entry = this.registry.get(base.id);
            if (!entry?.index.isReady) {
                continue;
            }
            try {
                const uris = await entry.index.indexStore.listDocumentUris();
                for (const uri of uris) {
                    paths.push(vscode.Uri.joinPath(vscode.Uri.file(base.root), uri).fsPath);
                }
            } catch {
                // ignore unopened stores
            }
        }
        return paths;
    }

    private enqueueSync(uri: vscode.Uri, change: 'created' | 'changed'): void {
        if (change === 'created' && this.pendingRenames.shouldSuppressCreate(uri.fsPath)) {
            return;
        }
        const entry = this.registry.baseForFilePath(uri.fsPath);
        if (!entry) {
            return;
        }
        const filter = loadRqIgnore(entry.descriptor.root);
        if (isIgnoredPath(filter, entry.descriptor.root, uri.fsPath, false)) {
            return;
        }
        void (async () => {
            await this.ensureBaseOpen(entry.descriptor.id);
            entry.index.enqueueIndex(uri.fsPath, change);
            this.scheduleIdleRelease(IDLE_QUIET_MS);
        })();
    }

    private enqueueDelete(uri: vscode.Uri): void {
        if (this.pendingRenames.shouldSuppressDelete(uri.fsPath)) {
            return;
        }
        const entry = this.registry.baseForFilePath(uri.fsPath);
        if (!entry) {
            for (const b of this.registry.list()) {
                const registered = this.registry.get(b.id);
                if (!registered?.index.isReady) {
                    continue;
                }
                registered.index.enqueueDelete(toIndexFileUri(uri, b.root));
            }
            this.scheduleIdleRelease(IDLE_QUIET_MS);
            return;
        }
        void (async () => {
            await this.ensureBaseOpen(entry.descriptor.id);
            entry.index.enqueueDelete(toIndexFileUri(uri, entry.descriptor.root));
            this.scheduleIdleRelease(IDLE_QUIET_MS);
        })();
    }

    private armPendingRenameClearTimer(): void {
        this.clearPendingRenameClearTimer();
        // If didRename never fires (cancelled rename), do not suppress deletes forever.
        this.pendingRenameClearTimer = setTimeout(() => {
            this.pendingRenameClearTimer = undefined;
            this.pendingRenames.clearAll();
        }, 60_000);
    }

    private clearPendingRenameClearTimer(): void {
        if (this.pendingRenameClearTimer !== undefined) {
            clearTimeout(this.pendingRenameClearTimer);
            this.pendingRenameClearTimer = undefined;
        }
    }

    /** Idle: optional stale check on already-open bases, then release all SQLite handles. */
    private scheduleIdleRelease(delayMs: number): void {
        this.clearIdleTimer();
        if (this.discoveryEmpty) {
            return;
        }
        this.idleTimer = setTimeout(() => {
            this.idleTimer = undefined;
            void this.checkStaleFiles();
        }, delayMs);
    }

    private clearIdleTimer(): void {
        if (this.idleTimer !== undefined) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }

    private activeEditorPath(): string | undefined {
        return vscode.window.activeTextEditor?.document.uri.fsPath;
    }

    /**
     * Fire-and-forget: if a base is not ready, open + soft-sync via the registry.
     * Coalesces concurrent nudges for the same base. Does not block the switcher.
     */
    private scheduleBaseCatchUp(baseId: string): void {
        const entry = this.registry.get(baseId);
        if (!entry || entry.index.isReady || entry.index.state === 'syncing' || entry.index.state === 'opening') {
            return;
        }
        if (this.catchUpInFlight.has(baseId)) {
            return;
        }
        const work = (async () => {
            try {
                const files = await this.filesForSync();
                await this.registry.ensureBaseReady(baseId, files);
            } catch {
                // Errors are recorded on the per-base store.
            } finally {
                this.notifyStatus();
                this.notifyCatalog();
                this.scheduleIdleRelease(IDLE_QUIET_MS);
            }
        })().finally(() => {
            this.catchUpInFlight.delete(baseId);
        });
        this.catchUpInFlight.set(baseId, work);
    }

    private async ensureBaseOpen(baseId: string): Promise<void> {
        const entry = this.registry.get(baseId);
        if (!entry) {
            return;
        }
        try {
            // Idempotent when already open; does not soft-sync.
            await entry.index.open();
        } catch {
            // recorded on the store
        }
    }

    private async releaseBase(baseId: string): Promise<void> {
        const entry = this.registry.get(baseId);
        if (!entry) {
            return;
        }
        await entry.index.deactivate();
        this.notifyStatus();
    }

    /**
     * Release SQLite handles that are not needed right now.
     * While the window is focused, keep the active base open for UI; always release inactive bases.
     * When unfocused, release every base so artifacts can be deleted.
     */
    private async releaseUnusedArtifacts(): Promise<void> {
        for (const base of this.registry.list()) {
            const entry = this.registry.get(base.id);
            if (!entry) {
                continue;
            }
            // Release all open SQLite handles during idle.
            // Descriptors stay registered so the next event can reopen the same base.
            // Idle must not leave connections open after a heal/sync, and must not schedule
            // another open unless a real host event arrives (file change, pin/switch,
            // focus reopen, command, UI query).
            // rq:["../../../../../reqlan rq/extension/index-host/sqlite-artifact-lifecycle.rq".release_when_idle]
            if (entry.index.state !== 'uninitialized') {
                await entry.index.deactivate();
            }
        }
        this.notifyStatus();
        this.notifyCatalog();
    }

    private notifyCatalog(): void {
        for (const listener of this.catalogListeners) {
            listener();
        }
    }

    private notifyStatus(): void {
        for (const listener of this.statusListeners) {
            listener();
        }
    }
}

function scanFiles(scan: WorkspaceScan): string[] {
    return [...scan.rqFiles, ...scan.codeFiles];
}

function descriptorsFromScan(scan: WorkspaceScan, roots: string[]): BaseDescriptor[] {
    return scan.bases.map(baseRoot => {
        const labelRoot = roots.find(root => isPathInsideOrEqual(baseRoot, root)) ?? roots[0];
        return toBaseDescriptor(baseRoot, labelRoot);
    });
}

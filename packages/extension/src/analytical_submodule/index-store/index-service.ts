/**
 * VS Code host adapter over multi-base {@link BaseRegistry} / {@link WorkspaceIndex}.
 * Owns file watching, Uri conversion, and create-base onboarding; indexing lives in `@reqlan/analytical`.
 */
import * as vscode from 'vscode';
import {
    BaseRegistry,
    baseForPath,
    createBase as createBaseMarker,
    isIgnoredPath,
    loadRqIgnore,
    type AnalyticalStore,
    type BaseDescriptor,
    type BaseStatusEntry,
    type IndexStatusSnapshot,
    type RegisteredBase
} from '@reqlan/analytical';
import { toIndexFileUri } from './resolve-index-file-uri.js';

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

/** Quiet period after index activity before an idle staleness check. */
const IDLE_QUIET_MS = 45_000;
/** Sooner check when the window loses focus. */
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

    constructor(
        /** @deprecated Prefer per-base stores via the registry; kept for AnalyticalSubmodule typing. */
        readonly sharedStore: AnalyticalStore,
        _legacyStoragePath?: string
    ) {}

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
        this.activeBaseId = baseId;
        this.notifyStatus();
        this.notifyCatalog();
        if (baseId) {
            this.scheduleBaseCatchUp(baseId);
        }
    }

    /** Resolve active base from a file path (longest match) and optionally pin it. */
    activateBaseForPath(absPath: string, pin = true): RegisteredBase | undefined {
        const match = baseForPath(this.listBases(), absPath);
        if (match && pin) {
            this.activeBaseId = match.id;
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
        return entry.index.fuzzySearch(query, options);
    }

    /** Analytical store for the active base (isolated per base). */
    get store(): AnalyticalStore {
        const entry = this.getActiveBase();
        if (!entry) {
            return this.sharedStore;
        }
        return entry.store;
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
                        this.scheduleIdleCheck(IDLE_UNFOCUSED_MS);
                        return;
                    }
                    if (this.idleSyncActive) {
                        this.cancelSync();
                    }
                    this.scheduleIdleCheck(IDLE_QUIET_MS);
                })
            );

            context.subscriptions.push({
                dispose: () => this.clearIdleTimer()
            });

            this.scheduleIdleCheck(IDLE_QUIET_MS);

            if (this.discoveryEmpty) {
                void this.promptCreateBaseIfNeeded();
            }
        } catch {
            // open/sync already recorded errors on per-base stores
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
        if (this.discoveryEmpty) {
            await this.rediscoverAndSync(false);
            if (this.discoveryEmpty) {
                this.notifyStatus();
                return false;
            }
        }
        const files = await this.collectRqFiles();
        if (baseId) {
            return this.registry.syncBase(baseId, files);
        }
        return this.registry.syncAll(files);
    }

    async clearAndRebuildIndex(baseId?: string): Promise<boolean> {
        if (this.discoveryEmpty) {
            return false;
        }
        const files = await this.collectRqFiles();
        const id = baseId ?? this.getActiveBaseId();
        if (!id) {
            return false;
        }
        return this.registry.clearAndRebuildBase(id, files);
    }

    cancelSync(baseId?: string): void {
        this.registry.cancelSync(baseId);
    }

    /** Background mtime staleness check — cheap when nothing changed. */
    async checkStaleFiles(): Promise<void> {
        if (this.discoveryEmpty || this.idleCheckInFlight) {
            return;
        }
        this.idleCheckInFlight = true;
        this.idleSyncActive = true;
        try {
            const files = await this.collectIndexFiles();
            await this.registry.checkStaleAll(files);
            this.notifyStatus();
            this.notifyCatalog();
        } finally {
            this.idleSyncActive = false;
            this.idleCheckInFlight = false;
        }
    }

    async indexFile(uri: vscode.Uri): Promise<void> {
        const entry = this.registry.baseForFilePath(uri.fsPath);
        if (!entry) {
            return;
        }
        await entry.index.indexFilePath(uri.fsPath);
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
        await entry.index.migrateRenamedFile(
            toIndexFileUri(oldUri, entry.descriptor.root),
            newUri.fsPath.endsWith('.rq') ? newUri.fsPath : undefined
        );
    }

    /**
     * Create `<folder>/.reqlan/` (empty dir marker), rediscover, and sync.
     * Defaults to the first workspace folder.
     */
    async createBase(folderUri?: vscode.Uri): Promise<BaseDescriptor | undefined> {
        const folder =
            folderUri ??
            vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!folder) {
            void vscode.window.showWarningMessage('Open a workspace folder to create a reqlan base.');
            return undefined;
        }
        await createBaseMarker(folder.fsPath);
        await this.rediscoverAndSync(true);
        const created = this.registry.list().find(b => b.root === folder.fsPath);
        if (created) {
            this.activeBaseId = created.id;
            this.notifyStatus();
            this.notifyCatalog();
        }
        return created;
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
        const previousActive = this.activeBaseId;
        const bases = this.registry.rediscover(roots);
        this.rewireRegistryListeners();

        if (bases.length === 0) {
            this.activeBaseId = undefined;
            this.notifyStatus();
            return;
        }

        if (previousActive && this.registry.get(previousActive)) {
            this.activeBaseId = previousActive;
        } else {
            const fromEditor = this.activeEditorPath();
            const selected = fromEditor
                ? baseForPath(bases, fromEditor)
                : undefined;
            this.activeBaseId = (selected ?? this.registry.selectDefault()?.descriptor)?.id;
        }

        await this.registry.activateAll();
        const files = await this.collectRqFiles();
        await this.registry.syncAll(files);
        this.notifyStatus();
        this.notifyCatalog();
        this.scheduleIdleCheck(IDLE_QUIET_MS);
    }

    private rewireRegistryListeners(): void {
        this.registryCatalogUnsub?.();
        this.registryStatusUnsub?.();
        this.registryCatalogUnsub = this.registry.subscribeCatalogUpdates(() => this.notifyCatalog());
        this.registryStatusUnsub = this.registry.subscribeStatusUpdates(() => this.notifyStatus());
    }

    private async collectRqFiles(): Promise<string[]> {
        const files = await vscode.workspace.findFiles('**/*.rq', '**/node_modules/**');
        const filterCache = new Map<string, ReturnType<typeof loadRqIgnore>>();
        return files
            .map(uri => uri.fsPath)
            .filter(fsPath => {
                const entry = this.registry.baseForFilePath(fsPath);
                if (!entry) {
                    return true;
                }
                let filter = filterCache.get(entry.descriptor.id);
                if (!filter) {
                    filter = loadRqIgnore(entry.descriptor.root);
                    filterCache.set(entry.descriptor.id, filter);
                }
                return !isIgnoredPath(filter, entry.descriptor.root, fsPath, false);
            });
    }

    private async collectIndexFiles(): Promise<string[]> {
        const rqFiles = await this.collectRqFiles();
        const extra: string[] = [];
        for (const base of this.registry.list()) {
            const entry = this.registry.get(base.id);
            if (!entry?.index.isReady) {
                continue;
            }
            try {
                const uris = await entry.index.indexStore.listDocumentUris();
                for (const uri of uris) {
                    if (uri.endsWith('.rq') || uri.endsWith('.RQ')) {
                        continue;
                    }
                    extra.push(vscode.Uri.joinPath(vscode.Uri.file(base.root), uri).fsPath);
                }
            } catch {
                // ignore unopened stores
            }
        }
        return [...rqFiles, ...extra];
    }

    private enqueueSync(uri: vscode.Uri, change: 'created' | 'changed'): void {
        const entry = this.registry.baseForFilePath(uri.fsPath);
        if (!entry) {
            return;
        }
        const filter = loadRqIgnore(entry.descriptor.root);
        if (isIgnoredPath(filter, entry.descriptor.root, uri.fsPath, false)) {
            return;
        }
        entry.index.enqueueIndex(uri.fsPath, change);
        this.scheduleIdleCheck(IDLE_QUIET_MS);
    }

    private enqueueDelete(uri: vscode.Uri): void {
        const entry = this.registry.baseForFilePath(uri.fsPath);
        if (!entry) {
            // Try each base with indexed uri form
            for (const b of this.registry.list()) {
                const registered = this.registry.get(b.id);
                registered?.index.enqueueDelete(toIndexFileUri(uri, b.root));
            }
            this.scheduleIdleCheck(IDLE_QUIET_MS);
            return;
        }
        entry.index.enqueueDelete(toIndexFileUri(uri, entry.descriptor.root));
        this.scheduleIdleCheck(IDLE_QUIET_MS);
    }

    private scheduleIdleCheck(delayMs: number): void {
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
                const files = await this.collectRqFiles();
                await this.registry.ensureBaseReady(baseId, files);
            } catch {
                // Errors are recorded on the per-base store.
            } finally {
                this.notifyStatus();
                this.notifyCatalog();
                this.scheduleIdleCheck(IDLE_QUIET_MS);
            }
        })().finally(() => {
            this.catchUpInFlight.delete(baseId);
        });
        this.catchUpInFlight.set(baseId, work);
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

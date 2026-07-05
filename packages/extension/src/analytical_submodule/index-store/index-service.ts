/**
 * Index service driven by the analytical Zustand store.
 */
import { URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createReqlanServices } from 'reqlan-language';
import { join } from 'node:path';
import * as vscode from 'vscode';
import {
    extractIndexedDocument,
    normalizeIndexedDocument,
    SqliteIndexStore,
    toFileIndexIssueView,
    toIndexErrorDetail,
    type AnalyticalStore
} from 'reqlan-analytical';
import type { IndexStatusSnapshot, IndexSyncProgress } from './index-status.js';
import { collectParseIssues, fileIssue, fileIssueFromError, unnamedIdeaIssues, validIdeas } from './index-parse-issues.js';
import { recordCaughtFileIssue } from './index-file-error.js';
import { toIndexFileUri } from './resolve-index-file-uri.js';

export type { IndexStatusSnapshot, IndexSyncProgress } from './index-status.js';

export class IndexService {
    private sqlite?: SqliteIndexStore;
    private readonly services = createReqlanServices({ ...NodeFileSystem });
    private watcher?: vscode.FileSystemWatcher;
    private syncQueue = Promise.resolve();
    private syncInFlight?: Promise<boolean>;
    private syncProgress?: IndexSyncProgress;
    private readonly catalogListeners = new Set<() => void>();
    private readonly statusListeners = new Set<() => void>();

    constructor(
        private readonly analytical: AnalyticalStore,
        private readonly storagePath: string
    ) {}

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

    getStatusSnapshot(): IndexStatusSnapshot {
        const storeState = this.analytical.getState();
        const relativePath = (uri: string) => vscode.workspace.asRelativePath(uri);
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

    async activate(context: vscode.ExtensionContext): Promise<void> {
        const { dispatchIndex, recordIndexError } = this.analytical.getState();
        dispatchIndex('activate');
        try {
            const dbPath = join(this.storagePath, 'ideas-index.sqlite');
            this.sqlite = await SqliteIndexStore.open(dbPath);
            dispatchIndex('opened');
            this.watcher = vscode.workspace.createFileSystemWatcher('**/*.rq');
            this.watcher.onDidCreate(uri => this.enqueueSync(uri, 'created'));
            this.watcher.onDidChange(uri => this.enqueueSync(uri, 'changed'));
            this.watcher.onDidDelete(uri => this.enqueueDelete(uri));
            context.subscriptions.push(this.watcher);
            void this.syncWorkspace();
        } catch (error) {
            dispatchIndex('fail');
            recordIndexError('Failed to open idea index', error, { phase: 'open' });
            this.notifyStatusUpdated();
        }
    }

    deactivate(): void {
        const { canDispatchIndex, dispatchIndex } = this.analytical.getState();
        if (canDispatchIndex('deactivate')) {
            dispatchIndex('deactivate');
        }
        void this.sqlite?.close();
        this.sqlite = undefined;
        this.watcher?.dispose();
    }

    async syncWorkspace(): Promise<boolean> {
        if (this.syncInFlight) {
            return this.syncInFlight;
        }
        this.syncInFlight = this.runSyncWorkspace().finally(() => {
            this.syncInFlight = undefined;
        });
        return this.syncInFlight;
    }

    async indexFile(uri: vscode.Uri): Promise<void> {
        if (!this.sqlite) {
            return;
        }
        const fileUri = toIndexFileUri(uri);
        const workspaceRoot = this.workspaceRoot;
        const analytical = this.analytical.getState();

        let document: LangiumDocument;
        try {
            document = await this.loadDocument(uri);
        } catch (error) {
            analytical.recordFileIndexIssues(fileUri, [
                fileIssueFromError('parse', error, 'Could not read or build document')
            ]);
            return;
        }

        const parseIssues = collectParseIssues(document);
        const extractedRaw = extractIndexedDocument(document);
        if (!extractedRaw) {
            const issues = parseIssues.length > 0
                ? parseIssues
                : [fileIssue('No reqlan model found in file', 'extract')];
            analytical.recordFileIndexIssues(fileUri, issues);
            return;
        }

        const extracted = workspaceRoot
            ? normalizeIndexedDocument(extractedRaw, workspaceRoot)
            : extractedRaw;
        const ideaNames = extracted.ideas.map(idea => idea.name).filter(Boolean);

        const existingHash = await this.sqlite.getDocumentHash(fileUri);
        const indexingIssues = [...parseIssues, ...unnamedIdeaIssues(extracted.ideas)];
        const ideasToPersist = validIdeas(extracted.ideas);

        if (existingHash === extracted.contentHash && indexingIssues.length === 0) {
            analytical.clearFileIndexIssuesForFile(fileUri);
            return;
        }

        for (const idea of ideasToPersist) {
            idea.contentHash = extracted.contentHash;
        }

        if (ideasToPersist.length > 0) {
            try {
                await this.sqlite.upsertDocument(fileUri, extracted.contentHash, ideasToPersist, extracted.edges);
            } catch (error) {
                indexingIssues.push(
                    fileIssueFromError(
                        'persist',
                        error,
                        'Failed to persist ideas to index',
                        0,
                        0,
                        ideaNames
                    )
                );
            }
        }

        if (indexingIssues.length > 0) {
            analytical.recordFileIndexIssues(fileUri, indexingIssues);
            if (ideasToPersist.length === 0) {
                return;
            }
        } else {
            analytical.clearFileIndexIssuesForFile(fileUri);
        }

        if (ideasToPersist.length > 0) {
            analytical.recordDocumentUpdate(fileUri, ideasToPersist.length);
            this.notifyCatalogUpdated();
        }
    }

    private get workspaceRoot(): string | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    private async runSyncWorkspace(): Promise<boolean> {
        if (!this.sqlite) {
            return false;
        }
        const analytical = this.analytical.getState();
        if (!analytical.dispatchIndex('sync')) {
            return this.waitForReadyOrError();
        }
        analytical.clearFileIndexIssues();
        analytical.clearLastError();
        this.notifyStatusUpdated();
        try {
            const files = await vscode.workspace.findFiles('**/*.rq', '**/node_modules/**');
            this.syncProgress = { processed: 0, total: files.length };
            this.notifyStatusUpdated();
            for (const uri of files) {
                await this.indexFile(uri);
                this.syncProgress = {
                    processed: this.syncProgress.processed + 1,
                    total: this.syncProgress.total
                };
                this.notifyStatusUpdated();
            }
            if (!analytical.dispatchIndex('synced')) {
                analytical.recordIndexError(
                    'Index sync finished but state transition to ready failed',
                    undefined,
                    { phase: 'transition' }
                );
            }
            const counts = await this.sqlite.counts();
            analytical.setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
            this.syncProgress = undefined;
            this.notifyCatalogUpdated();
            this.notifyStatusUpdated();
            return this.isReady;
        } catch (error) {
            analytical.dispatchIndex('fail');
            analytical.recordIndexError('Workspace sync failed', error, { phase: 'sync' });
            this.syncProgress = undefined;
            this.notifyStatusUpdated();
            return false;
        }
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

    private enqueueSync(uri: vscode.Uri, change: 'created' | 'changed'): void {
        this.analytical.getState().recordWorkspaceChange(uri.toString(), change);
        this.syncQueue = this.syncQueue.then(async () => {
            if (this.syncInFlight) {
                await this.syncInFlight;
                return;
            }
            const analytical = this.analytical.getState();
            if (!analytical.canDispatchIndex('sync')) {
                return;
            }
            analytical.dispatchIndex('sync');
            this.notifyStatusUpdated();
            try {
                await this.indexFile(uri);
                if (this.sqlite) {
                    const counts = await this.sqlite.counts();
                    analytical.setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
                }
                analytical.dispatchIndex('synced');
            } catch (error) {
                recordCaughtFileIssue(
                    analytical.recordFileIndexIssues,
                    toIndexFileUri(uri),
                    error,
                    `Failed to index ${vscode.workspace.asRelativePath(uri)}`
                );
                analytical.dispatchIndex('synced');
            } finally {
                this.notifyStatusUpdated();
            }
        });
    }

    private enqueueDelete(uri: vscode.Uri): void {
        this.analytical.getState().recordWorkspaceChange(uri.toString(), 'deleted');
        this.syncQueue = this.syncQueue.then(async () => {
            await this.sqlite?.removeDocument(toIndexFileUri(uri));
            this.analytical.getState().clearFileIndexIssuesForFile(toIndexFileUri(uri));
            if (this.sqlite) {
                const counts = await this.sqlite.counts();
                this.analytical.getState().setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
            }
            this.notifyCatalogUpdated();
            this.notifyStatusUpdated();
        });
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

    private async loadDocument(uri: vscode.Uri): Promise<LangiumDocument> {
        const content = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(content).toString('utf8');
        const langiumUri = URI.parse(uri.toString());
        const document = this.services.shared.workspace.LangiumDocumentFactory.fromString(text, langiumUri);
        await this.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        return document;
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Index service driven by the analytical Zustand store.
 */
import { URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createReqlanServices } from 'reqlan-language';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { AnalyticalStore } from '../core/analytical-store.js';
import { extractIndexedDocument } from './idea-extractor.js';
import { SqliteIndexStore } from './sqlite-store.js';

export class IndexService {
    private sqlite?: SqliteIndexStore;
    private readonly services = createReqlanServices({ ...NodeFileSystem });
    private watcher?: vscode.FileSystemWatcher;
    private syncQueue = Promise.resolve();

    constructor(
        private readonly analytical: AnalyticalStore,
        private readonly storagePath: string
    ) {}

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

    async activate(context: vscode.ExtensionContext): Promise<void> {
        const { dispatchIndex, recordIndexError } = this.analytical.getState();
        dispatchIndex('activate');
        try {
            const dbPath = join(this.storagePath, 'ideas-index.sqlite');
            this.sqlite = new SqliteIndexStore(dbPath);
            dispatchIndex('opened');
            this.watcher = vscode.workspace.createFileSystemWatcher('**/*.rq');
            this.watcher.onDidCreate(uri => this.enqueueSync(uri, 'created'));
            this.watcher.onDidChange(uri => this.enqueueSync(uri, 'changed'));
            this.watcher.onDidDelete(uri => this.enqueueDelete(uri));
            context.subscriptions.push(this.watcher);
            await this.syncWorkspace();
        } catch (error) {
            dispatchIndex('fail');
            recordIndexError('Failed to open idea index', error);
            throw error;
        }
    }

    deactivate(): void {
        const { canDispatchIndex, dispatchIndex } = this.analytical.getState();
        if (canDispatchIndex('deactivate')) {
            dispatchIndex('deactivate');
        }
        this.sqlite?.close();
        this.sqlite = undefined;
        this.watcher?.dispose();
    }

    async syncWorkspace(): Promise<void> {
        if (!this.sqlite) {
            return;
        }
        const { dispatchIndex, setIndexReady, recordIndexError } = this.analytical.getState();
        dispatchIndex('sync');
        try {
            const files = await vscode.workspace.findFiles('**/*.rq', '**/node_modules/**');
            for (const uri of files) {
                await this.indexFile(uri);
            }
            const counts = this.sqlite.counts();
            dispatchIndex('synced');
            setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
        } catch (error) {
            dispatchIndex('fail');
            recordIndexError('Workspace sync failed', error);
        }
    }

    async indexFile(uri: vscode.Uri): Promise<void> {
        if (!this.sqlite) {
            return;
        }
        const fileUri = uri.toString();
        const existingHash = this.sqlite.getDocumentHash(fileUri);
        const document = await this.parseDocument(uri);
        if (!document) {
            return;
        }
        const extracted = extractIndexedDocument(document);
        if (!extracted) {
            return;
        }
        if (existingHash === extracted.contentHash) {
            return;
        }
        for (const idea of extracted.ideas) {
            idea.contentHash = extracted.contentHash;
        }
        this.sqlite.upsertDocument(fileUri, extracted.contentHash, extracted.ideas, extracted.edges);
        this.analytical.getState().recordDocumentUpdate(fileUri, extracted.ideas.length);
    }

    private enqueueSync(uri: vscode.Uri, change: 'created' | 'changed'): void {
        this.analytical.getState().recordWorkspaceChange(uri.toString(), change);
        this.syncQueue = this.syncQueue.then(async () => {
            const { canDispatchIndex, dispatchIndex, recordIndexError } = this.analytical.getState();
            if (!canDispatchIndex('sync')) {
                return;
            }
            dispatchIndex('sync');
            try {
                await this.indexFile(uri);
                dispatchIndex('synced');
            } catch (error) {
                dispatchIndex('fail');
                recordIndexError(`Failed to index ${uri.fsPath}`, error);
            }
        });
    }

    private enqueueDelete(uri: vscode.Uri): void {
        this.analytical.getState().recordWorkspaceChange(uri.toString(), 'deleted');
        this.syncQueue = this.syncQueue.then(() => {
            this.sqlite?.removeDocument(uri.toString());
        });
    }

    private async parseDocument(uri: vscode.Uri): Promise<LangiumDocument | undefined> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(content).toString('utf8');
            const langiumUri = URI.parse(uri.toString());
            const document = this.services.shared.workspace.LangiumDocumentFactory.fromString(text, langiumUri);
            await this.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
            return document;
        } catch {
            return undefined;
        }
    }
}

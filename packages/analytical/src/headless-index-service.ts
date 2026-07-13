import { URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createReqlanServices } from 'reqlan-language';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { AnalyticalStore } from './core/analytical-store.js';
import { normalizeIndexedDocument, resolveWorkspaceFileUri } from './core/workspace-paths.js';
import { extractIndexedDocument } from './index-store/idea-extractor.js';
import { SqliteIndexStore } from './index-store/sqlite-store.js';

export class HeadlessIndexService {
    private sqlite?: SqliteIndexStore;
    private readonly services = createReqlanServices({ ...NodeFileSystem });

    constructor(
        private readonly analytical: AnalyticalStore,
        private readonly storagePath: string,
        private readonly workspaceRoot: string
    ) {}

    get isReady(): boolean {
        return this.analytical.getState().indexState === 'ready';
    }

    get indexStore(): SqliteIndexStore {
        if (!this.sqlite) {
            throw new Error('Index store is not open');
        }
        return this.sqlite;
    }

    async activate(): Promise<void> {
        const { dispatchIndex, recordIndexError } = this.analytical.getState();
        dispatchIndex('activate');
        try {
            const dbPath = join(this.storagePath, 'ideas-index.sqlite');
            this.sqlite = await SqliteIndexStore.open(dbPath);
            dispatchIndex('opened');
            await this.syncWorkspace();
        } catch (error) {
            dispatchIndex('fail');
            recordIndexError('Failed to open idea index', error);
            throw error;
        }
    }

    async deactivate(): Promise<void> {
        const { canDispatchIndex, dispatchIndex } = this.analytical.getState();
        if (canDispatchIndex('deactivate')) {
            dispatchIndex('deactivate');
        }
        await this.sqlite?.close();
        this.sqlite = undefined;
    }

    async syncWorkspace(): Promise<void> {
        if (!this.sqlite) {
            return;
        }
        const { dispatchIndex, setIndexReady, recordIndexError } = this.analytical.getState();
        if (!dispatchIndex('sync')) {
            return;
        }
        try {
            const files = await this.collectRqFiles();
            for (const filePath of files) {
                try {
                    await this.indexFilePath(filePath);
                } catch (error) {
                    recordIndexError(`Failed to index ${relative(this.workspaceRoot, filePath)}`, error, {
                        fileUri: relative(this.workspaceRoot, filePath).replace(/\\/g, '/'),
                        phase: 'sync'
                    });
                }
            }
            if (!dispatchIndex('synced')) {
                recordIndexError('Index sync finished but state transition to ready failed', undefined);
            }
            const counts = await this.sqlite.counts();
            setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
        } catch (error) {
            dispatchIndex('fail');
            recordIndexError('Workspace sync failed', error);
            throw error;
        }
    }

    async indexFilePath(filePath: string): Promise<void> {
        if (!this.sqlite) {
            return;
        }
        const document = await this.parseDocument(filePath);
        if (!document) {
            return;
        }
        const extractedRaw = extractIndexedDocument(document);
        if (!extractedRaw) {
            return;
        }
        const extracted = normalizeIndexedDocument(extractedRaw, this.workspaceRoot);
        const fileUri = extracted.fileUri;
        const existingHash = await this.sqlite.getDocumentHash(fileUri);
        if (existingHash === extracted.contentHash) {
            const storedEdges = await this.sqlite.countEdgesFromFile(fileUri);
            if (storedEdges >= extracted.edges.length) {
                return;
            }
        }
        for (const idea of extracted.ideas) {
            idea.contentHash = extracted.contentHash;
        }
        await this.sqlite.upsertDocument(fileUri, extracted.contentHash, extracted.ideas, extracted.edges);
        this.analytical.getState().recordDocumentUpdate(fileUri, extracted.ideas.length);
    }

    relativePath(fileUri: string): string {
        if (!fileUri.startsWith('file://') && !fileUri.startsWith('/')) {
            return fileUri;
        }
        try {
            const filePath = URI.parse(fileUri).fsPath;
            return relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
        } catch {
            return fileUri;
        }
    }

    resolveFileUri(pathInput: string): string {
        return resolveWorkspaceFileUri(pathInput, this.workspaceRoot);
    }

    listRqFiles(pathPrefix = ''): string[] {
        return [...this.rqFilePaths]
            .map(filePath => relative(this.workspaceRoot, filePath))
            .filter(relativePath => !pathPrefix || relativePath.includes(pathPrefix))
            .sort((left, right) => left.localeCompare(right));
    }

    private rqFilePaths: string[] = [];

    private async collectRqFiles(): Promise<string[]> {
        const results: string[] = [];
        await this.walkDirectory(this.workspaceRoot, results);
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
            if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                continue;
            }
            const fullPath = join(directory, entry.name);
            if (entry.isDirectory()) {
                await this.walkDirectory(fullPath, results);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith('.rq')) {
                results.push(fullPath);
            }
        }
    }

    private async parseDocument(filePath: string): Promise<LangiumDocument | undefined> {
        try {
            const text = await readFile(filePath, 'utf8');
            const langiumUri = URI.file(filePath);
            const document = this.services.shared.workspace.LangiumDocumentFactory.fromString(text, langiumUri);
            await this.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
            return document;
        } catch {
            return undefined;
        }
    }
}

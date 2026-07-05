/**
 * Paginated ideas/references webview per ["../../../../reqlan rq/extension/module/webview.rq"]
 */
import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import type { IndexStatusSnapshot } from '../analytical_submodule/index-store/index-status.js';
import {
    IDEAS_PAGE_SIZE,
    IDEASETS_PAGE_SIZE,
    REFERENCES_PAGE_SIZE,
    type ExtensionToWebviewMessage,
    type GraphViewQuery,
    type GraphViewSlice,
    type IdeasTableQuery,
    type IdeasetsTableQuery,
    type IndexStatusView,
    type ReferenceFilter,
    type ReferencesTableQuery,
    type WebviewToExtensionMessage
} from './shared/messages.js';
import { getIdeasSummaryHtml } from './get-ideas-summary-html.js';
import { resolveIndexFileUri, toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import { buildGraphViewSlice, GRAPH_MAX_NODES, type GraphViewSlice as AnalyticalGraphViewSlice } from 'reqlan-analytical';

const VIEW_TYPE = 'reqlan.ideasSummary';

const DEFAULT_IDEAS_QUERY: IdeasTableQuery = {
    page: 0,
    pageSize: IDEAS_PAGE_SIZE,
    sortBy: 'path',
    sortDir: 'asc',
    attributeColumns: [],
    referenceFilters: []
};

const DEFAULT_IDEASETS_QUERY: IdeasetsTableQuery = {
    page: 0,
    pageSize: IDEASETS_PAGE_SIZE,
    sortBy: 'path',
    sortDir: 'asc'
};

const DEFAULT_REFERENCES_QUERY: ReferencesTableQuery = {
    page: 0,
    pageSize: REFERENCES_PAGE_SIZE,
    sortBy: 'source',
    sortDir: 'asc'
};

const DEFAULT_GRAPH_QUERY: GraphViewQuery = {
    includeIndirect: false,
    maxNodes: GRAPH_MAX_NODES
};

export class IdeasSummaryPanel {
    private static current?: IdeasSummaryPanel;

    static show(context: vscode.ExtensionContext, submodule: AnalyticalSubmodule): void {
        if (IdeasSummaryPanel.current) {
            IdeasSummaryPanel.current.panel.reveal(vscode.ViewColumn.One);
            return;
        }
        IdeasSummaryPanel.current = new IdeasSummaryPanel(context, submodule);
    }

    readonly panel: vscode.WebviewPanel;
    private readonly statusUnsubscribe: () => void;
    private ideasQuery: IdeasTableQuery = { ...DEFAULT_IDEAS_QUERY };
    private ideasetsQuery: IdeasetsTableQuery = { ...DEFAULT_IDEASETS_QUERY };
    private referencesQuery: ReferencesTableQuery = { ...DEFAULT_REFERENCES_QUERY };
    private graphQuery: GraphViewQuery = { ...DEFAULT_GRAPH_QUERY };

    private constructor(
        context: vscode.ExtensionContext,
        private readonly submodule: AnalyticalSubmodule
    ) {
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            'Reqlan Ideas Summary',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media', 'webviews', 'ideas-summary')
                ]
            }
        );
        this.panel.webview.html = getIdeasSummaryHtml(this.panel.webview, context.extensionUri);

        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message as WebviewToExtensionMessage),
            undefined,
            context.subscriptions
        );
        this.panel.onDidDispose(() => {
            IdeasSummaryPanel.current = undefined;
            this.statusUnsubscribe();
        }, undefined, context.subscriptions);

        this.statusUnsubscribe = submodule.index.subscribeStatusUpdates(() => {
            void this.sendIndexStatus();
        });

        context.subscriptions.push(this.panel);
    }

    private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        switch (message.type) {
            case 'ready':
                void this.sendIndexStatus();
                void this.bootstrapData();
                break;
            case 'loadIndexStatus':
                await this.sendIndexStatus();
                break;
            case 'refreshIndex':
                await this.refreshIndexData();
                break;
            case 'clearAndRebuildIndex': {
                const confirmed = await vscode.window.showWarningMessage(
                    'Clear the idea index and rebuild it from scratch? This removes all indexed ideas and references.',
                    { modal: true },
                    'Clear & rebuild'
                );
                if (confirmed !== 'Clear & rebuild') {
                    break;
                }
                await this.submodule.index.clearAndRebuildIndex();
                await this.refreshIndexData();
                break;
            }
            case 'loadIdeas':
                this.ideasQuery = message.query;
                await this.sendIdeasPage();
                break;
            case 'loadIdeasets':
                this.ideasetsQuery = message.query;
                await this.sendIdeasetsPage();
                break;
            case 'loadReferences':
                this.referencesQuery = message.query;
                await this.sendReferencesPage();
                break;
            case 'loadGraph':
                this.graphQuery = message.query;
                await this.sendGraphSlice();
                break;
            case 'openIdea':
                await openIdea(message.fileUri, message.line, message.column);
                break;
            case 'dumpFullGraph':
                await this.sendFullGraph();
                break;
        }
    }

    private post(message: ExtensionToWebviewMessage): void {
        void this.panel.webview.postMessage(message);
    }

    private async refreshIndexData(): Promise<void> {
        await this.submodule.index.syncWorkspace();
        await this.sendIndexStatus();
        if (this.submodule.index.isReady) {
            this.ideasQuery = { ...this.ideasQuery, page: 0 };
            this.ideasetsQuery = { ...this.ideasetsQuery, page: 0 };
            this.referencesQuery = { ...this.referencesQuery, page: 0 };
            await this.sendIdeasPage();
            await this.sendIdeasetsPage();
            await this.sendReferencesPage();
            await this.sendGraphSlice();
        }
    }

    private async bootstrapData(): Promise<void> {
        await this.submodule.index.syncWorkspace();
        await this.sendIndexStatus();
        if (this.submodule.index.isReady) {
            await this.sendIdeasPage();
            await this.sendIdeasetsPage();
            await this.sendReferencesPage();
        }
    }

    private async sendIndexStatus(): Promise<void> {
        this.post({ type: 'indexStatus', status: toIndexStatusView(this.submodule.index.getStatusSnapshot()) });
    }

    private async sendIdeasPage(): Promise<void> {
        if (!this.submodule.index.isReady) {
            return;
        }
        const store = this.submodule.index.indexStore;
        const query = normalizeIdeasQuery(this.ideasQuery);
        const total = await store.countIdeas(query);
        const safePage = clampPage(query.page, total, query.pageSize);
        const resolvedQuery = { ...query, page: safePage };
        const rows = (await store.listIdeasPage(resolvedQuery))
            .map(row => ({
                ...row,
                path: vscode.workspace.asRelativePath(row.path)
            }));
        this.post({
            type: 'ideasPage',
            query: resolvedQuery,
            total,
            rows
        });
    }

    private async sendIdeasetsPage(): Promise<void> {
        if (!this.submodule.index.isReady) {
            return;
        }
        const store = this.submodule.index.indexStore;
        const query = normalizeIdeasetsQuery(this.ideasetsQuery);
        const total = await store.countIdeasets(query);
        const safePage = clampPage(query.page, total, query.pageSize);
        const resolvedQuery = { ...query, page: safePage };
        const rows = (await store.listIdeasetsPage(resolvedQuery))
            .map(row => ({
                ...row,
                path: vscode.workspace.asRelativePath(row.path)
            }));
        this.post({
            type: 'ideasetsPage',
            query: resolvedQuery,
            total,
            rows
        });
    }

    private async sendReferencesPage(): Promise<void> {
        if (!this.submodule.index.isReady) {
            return;
        }
        const store = this.submodule.index.indexStore;
        const query = normalizeReferencesQuery(this.referencesQuery);
        const total = await store.countReferences(query);
        const safePage = clampPage(query.page, total, query.pageSize);
        const resolvedQuery = { ...query, page: safePage };
        const rows = (await store.listReferencesPage(resolvedQuery))
            .map(row => ({
                ...row,
                sourcePath: vscode.workspace.asRelativePath(row.sourcePath),
                targetPath: row.targetPath ? vscode.workspace.asRelativePath(row.targetPath) : '—'
            }));
        this.post({
            type: 'referencesPage',
            query: resolvedQuery,
            total,
            rows
        });
    }

    private async sendGraphSlice(): Promise<void> {
        const query = normalizeGraphQuery(this.graphQuery);
        if (!this.submodule.index.isReady) {
            this.post({
                type: 'graphSlice',
                slice: {
                    query,
                    depth: query.includeIndirect ? 2 : 1,
                    truncated: false,
                    nodes: [],
                    edges: [],
                    waitingForIndex: true
                }
            });
            return;
        }
        try {
            let resolvedQuery = query;
            if (!resolvedQuery.centerId && !hasGraphFilters(resolvedQuery)) {
                const centerId = await defaultGraphCenterId(this.submodule);
                if (centerId) {
                    resolvedQuery = { ...resolvedQuery, centerId };
                }
            }
            this.graphQuery = resolvedQuery;
            const store = this.submodule.index.indexStore;
            const slice = await buildGraphViewSlice(store, resolvedQuery);
            this.post({
                type: 'graphSlice',
                slice: toGraphSliceView(slice)
            });
        } catch (error) {
            this.post({
                type: 'error',
                message: error instanceof Error ? error.message : 'Failed to load graph.'
            });
        }
    }
    private async sendFullGraph(): Promise<void> {
        if (!this.submodule.index.isReady) {
            this.post({ type: 'error', message: 'Index is not ready yet.' });
            return;
        }
        const store = this.submodule.index.indexStore;
        const counts = await store.counts();
        const ideas = await store.getAllIdeasRaw();
        const edges = await store.getAllEdges();
        this.post({
            type: 'fullGraph',
            ideaCount: counts.ideas,
            edgeCount: counts.edges,
            ideasJson: JSON.stringify(ideas),
            edgesJson: JSON.stringify(edges)
        });
    }
}

function normalizeGraphQuery(query: GraphViewQuery): GraphViewQuery {
    return {
        centerId: query.centerId?.trim() || undefined,
        search: query.search?.trim() || undefined,
        pathFilter: query.pathFilter?.trim() || undefined,
        statusFilter: query.statusFilter?.trim() || undefined,
        tagFilter: query.tagFilter?.trim() || undefined,
        includeIndirect: Boolean(query.includeIndirect),
        maxNodes: Math.min(Math.max(1, query.maxNodes ?? GRAPH_MAX_NODES), 200)
    };
}

function hasGraphFilters(query: GraphViewQuery): boolean {
    return Boolean(
        query.search ||
        query.pathFilter ||
        query.statusFilter ||
        query.tagFilter
    );
}

function toGraphSliceView(slice: AnalyticalGraphViewSlice): GraphViewSlice {
    return {
        ...slice,
        nodes: slice.nodes.map(node => ({
            ...node,
            path: node.isExternal ? node.fileUri : vscode.workspace.asRelativePath(node.fileUri)
        }))
    };
}

async function defaultGraphCenterId(submodule: AnalyticalSubmodule): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !submodule.index.isReady) {
        return undefined;
    }
    const fileUri = toIndexFileUri(editor.document.uri);
    const ideas = await submodule.index.indexStore.getIdeasInFile(fileUri);
    return ideas[0]?.id;
}

function normalizeIdeasQuery(query: IdeasTableQuery): IdeasTableQuery {
    return {
        page: Math.max(0, query.page),
        pageSize: query.pageSize || IDEAS_PAGE_SIZE,
        search: query.search?.trim() || undefined,
        sortBy: query.sortBy ?? 'path',
        sortDir: query.sortDir ?? 'asc',
        attributeColumns: [...new Set(query.attributeColumns)],
        referenceFilters: dedupeReferenceFilters(query.referenceFilters ?? [])
    };
}

function dedupeReferenceFilters(filters: ReferenceFilter[]): ReferenceFilter[] {
    const seen = new Set<string>();
    const result: ReferenceFilter[] = [];
    for (const filter of filters) {
        if (seen.has(filter.filterKey)) {
            continue;
        }
        seen.add(filter.filterKey);
        result.push(filter);
    }
    return result;
}

function normalizeIdeasetsQuery(query: IdeasetsTableQuery): IdeasetsTableQuery {
    return {
        page: Math.max(0, query.page),
        pageSize: query.pageSize || IDEASETS_PAGE_SIZE,
        search: query.search?.trim() || undefined,
        sortBy: query.sortBy ?? 'path',
        sortDir: query.sortDir ?? 'asc'
    };
}

function normalizeReferencesQuery(query: ReferencesTableQuery): ReferencesTableQuery {
    return {
        page: Math.max(0, query.page),
        pageSize: query.pageSize || REFERENCES_PAGE_SIZE,
        search: query.search?.trim() || undefined,
        sortBy: query.sortBy ?? 'source',
        sortDir: query.sortDir ?? 'asc'
    };
}

function toIndexStatusView(snapshot: IndexStatusSnapshot): IndexStatusView {
    const recentActivity = [
        ...snapshot.recentDocumentUpdates.map(update => ({
            label: 'Indexed',
            detail: vscode.workspace.asRelativePath(update.fileUri),
            at: update.at
        })),
        ...snapshot.recentWorkspaceChanges.map(change => ({
            label: `File ${change.change}`,
            detail: vscode.workspace.asRelativePath(change.fileUri),
            at: change.at
        }))
    ]
        .sort((left, right) => right.at - left.at)
        .slice(0, 12);

    return {
        state: snapshot.state,
        ready: snapshot.ready,
        ideaCount: snapshot.ideaCount,
        edgeCount: snapshot.edgeCount,
        fileIssueCount: snapshot.fileIssueCount,
        lastError: snapshot.lastError,
        fileIssues: snapshot.fileIssues,
        syncProgress: snapshot.syncProgress,
        recentActivity
    };
}

function clampPage(page: number, total: number, pageSize: number): number {
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    return Math.min(Math.max(0, page), maxPage);
}

async function openIdea(fileUri: string, line: number, column = 0): Promise<void> {
    const uri = resolveIndexFileUri(fileUri);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(line, column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
}

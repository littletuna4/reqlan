/**
 * Ideas Summary webview host.
 * per ["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_summary]
 * per ["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".ontology_aligned_tabs]
 */
import * as vscode from 'vscode';
import { join } from 'node:path';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import type { IndexStatusSnapshot } from '@reqlan/analytical';
import {
    ATTRIBUTES_PAGE_SIZE,
    IDEAS_PAGE_SIZE,
    IDEASETS_PAGE_SIZE,
    REFERENCES_PAGE_SIZE,
    type AttributesTableQuery,
    type ExtensionToWebviewMessage,
    type GraphViewQuery,
    type GraphViewSlice,
    type IdeasTableQuery,
    type IdeasetsTableQuery,
    type IndexStatusView,
    type BaseStatusView,
    type ReferenceFilter,
    type ReferencesTableQuery,
    type TableUiPersistedState,
    type WebviewToExtensionMessage
} from './shared/messages.js';
import {
    GRAPH_UI_WORKSPACE_STATE_KEY,
    graphUiWorkspaceStateKey,
    normalizeGraphUiState,
    type GraphUiPersistedState
} from './shared/graph-ui-state.js';
import {
    TABLE_UI_WORKSPACE_STATE_KEY,
    normalizeTableUiState
} from './shared/table-ui-state.js';
import {
    normalizeColumnFilters,
    preserveFilterText
} from './shared/table-query-normalize.js';
import type { IdeasSummaryNavigateIntent } from './shared/messages.js';
import { getIdeasSummaryHtml } from './get-ideas-summary-html.js';
import { openIndexFile } from '../analytical_submodule/index-store/open-index-file.js';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import { getPhonebookLink } from '../shared/phonebook.js';
import { safeWebviewPost } from '../shared/safe-webview-post.js';
import {
    buildFocusSignals,
    buildGraphViewSlice,
    computeOverviewCoverageScores,
    GRAPH_MAX_NODES,
    GRAPH_NODES_HARD_CAP,
    hotspotBandFromRisk,
    synthesizeFocusContext,
    type GraphViewSlice as AnalyticalGraphViewSlice
} from '@reqlan/analytical';

const VIEW_TYPE = 'reqlan.ideasSummary';

const DEFAULT_IDEAS_QUERY: IdeasTableQuery = {
    page: 0,
    pageSize: IDEAS_PAGE_SIZE,
    sortBy: 'path',
    sortDir: 'asc',
    attributeColumns: [],
    referenceFilters: [],
    columnFilters: []
};

const DEFAULT_IDEASETS_QUERY: IdeasetsTableQuery = {
    page: 0,
    pageSize: IDEASETS_PAGE_SIZE,
    sortBy: 'path',
    sortDir: 'asc',
    columnFilters: []
};

const DEFAULT_REFERENCES_QUERY: ReferencesTableQuery = {
    page: 0,
    pageSize: REFERENCES_PAGE_SIZE,
    sortBy: 'source',
    sortDir: 'asc',
    columnFilters: []
};

const DEFAULT_ATTRIBUTES_QUERY: AttributesTableQuery = {
    page: 0,
    pageSize: ATTRIBUTES_PAGE_SIZE,
    sortBy: 'ideaCount',
    sortDir: 'desc',
    columnFilters: []
};

const DEFAULT_GRAPH_QUERY: GraphViewQuery = {
    includeIndirect: false,
    includeWildcardRefs: true,
    maxNodes: GRAPH_MAX_NODES,
    truncationBasis: 'path'
};

export class IdeasSummaryPanel {
    private static current?: IdeasSummaryPanel;
    private static activationGeneration = 0;

    static bumpActivationGeneration(): number {
        IdeasSummaryPanel.activationGeneration += 1;
        return IdeasSummaryPanel.activationGeneration;
    }

    static forceDispose(): void {
        if (!IdeasSummaryPanel.current) {
            return;
        }
        IdeasSummaryPanel.current.panel.dispose();
        IdeasSummaryPanel.current = undefined;
    }

    static show(
        context: vscode.ExtensionContext,
        submodule: AnalyticalSubmodule,
        activationGeneration: number,
        intent?: IdeasSummaryNavigateIntent
    ): void {
        if (
            IdeasSummaryPanel.current &&
            IdeasSummaryPanel.current.activationGeneration !== activationGeneration
        ) {
            IdeasSummaryPanel.forceDispose();
        }
        if (IdeasSummaryPanel.current) {
            IdeasSummaryPanel.current.panel.reveal(vscode.ViewColumn.One);
            void IdeasSummaryPanel.current.sendIndexStatus();
            if (intent) {
                IdeasSummaryPanel.current.applyNavigateIntent(intent);
            }
            return;
        }
        IdeasSummaryPanel.current = new IdeasSummaryPanel(context, submodule, activationGeneration, intent);
    }

    readonly panel: vscode.WebviewPanel;
    private readonly statusUnsubscribe: () => void;
    private readonly activationGeneration: number;
    private ideasQuery: IdeasTableQuery = { ...DEFAULT_IDEAS_QUERY };
    private ideasetsQuery: IdeasetsTableQuery = { ...DEFAULT_IDEASETS_QUERY };
    private referencesQuery: ReferencesTableQuery = { ...DEFAULT_REFERENCES_QUERY };
    private attributesQuery: AttributesTableQuery = { ...DEFAULT_ATTRIBUTES_QUERY };
    private graphQuery: GraphViewQuery = { ...DEFAULT_GRAPH_QUERY };

    private statusPostTimer: ReturnType<typeof setTimeout> | undefined;
    private bootstrapPromise: Promise<void> | undefined;
    private graphSliceGeneration = 0;
    private graphSlicePending = false;
    private coverageGeneration = 0;

    private constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly submodule: AnalyticalSubmodule,
        activationGeneration: number,
        initialIntent?: IdeasSummaryNavigateIntent
    ) {
        this.activationGeneration = activationGeneration;
        const restoredUi = this.readGraphUiState();
        this.graphQuery = {
            ...this.graphQuery,
            maxNodes: restoredUi.maxNodes,
            truncationBasis: restoredUi.truncationBasis
        };
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            'Reqlan Ideas Summary',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webviews', 'ideas-summary')
                ]
            }
        );

        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message as WebviewToExtensionMessage),
            undefined,
            this.context.subscriptions
        );
        this.panel.onDidDispose(() => {
            IdeasSummaryPanel.current = undefined;
            this.statusUnsubscribe();
        }, undefined, this.context.subscriptions);

        this.panel.webview.html = getIdeasSummaryHtml(this.panel.webview, this.context.extensionUri);

        this.statusUnsubscribe = submodule.index.subscribeStatusUpdates(() => {
            this.scheduleStatusUpdate();
        });

        this.context.subscriptions.push(this.panel);

        if (initialIntent?.baseId) {
            submodule.index.setActiveBaseId(initialIntent.baseId);
        } else {
            const editorPath = vscode.window.activeTextEditor?.document.uri.fsPath;
            if (editorPath) {
                submodule.index.activateBaseForPath(editorPath);
            }
        }

        if (initialIntent) {
            queueMicrotask(() => this.applyNavigateIntent(initialIntent));
        }
    }

    applyNavigateIntent(intent: IdeasSummaryNavigateIntent): void {
        if (intent.baseId) {
            this.submodule.index.setActiveBaseId(intent.baseId);
            this.reloadGraphUiForActiveBase();
        }
        if (intent.pathFilter) {
            this.ideasQuery = {
                ...this.ideasQuery,
                page: 0,
                search: intent.pathFilter
            };
        }
        if (intent.referenceFilters?.length) {
            this.ideasQuery = {
                ...this.ideasQuery,
                page: 0,
                referenceFilters: intent.referenceFilters
            };
        }
        if (intent.centerId || intent.includeIndirect !== undefined || intent.pathFilter) {
            this.graphQuery = {
                ...this.graphQuery,
                centerId: intent.centerId ?? this.graphQuery.centerId,
                includeIndirect: intent.includeIndirect ?? this.graphQuery.includeIndirect,
                pathFilter: intent.pathFilter ?? this.graphQuery.pathFilter
            };
            this.graphSlicePending = true;
        }
        this.post({
            type: 'navigate',
            intent
        });
        if (this.submodule.index.isReady) {
            void this.sendIdeasPage();
            void this.runGraphSlice(++this.graphSliceGeneration);
        }
    }

    private scheduleStatusUpdate(): void {
        clearTimeout(this.statusPostTimer);
        this.statusPostTimer = setTimeout(() => {
            void this.sendIndexStatus();
        }, 150);
    }

    private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        try {
            switch (message.type) {
                case 'ready':
                    this.postGraphUiState();
                    this.postTableUiState();
                    this.postOverviewLinks();
                    void this.sendIndexStatus();
                    void this.bootstrapData();
                    break;
                case 'loadIndexStatus':
                    await this.sendIndexStatus();
                    break;
                case 'refreshIndex':
                    await this.refreshIndexData();
                    break;
                case 'cancelIndexSync':
                    this.submodule.index.cancelSync();
                    await this.sendIndexStatus();
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
                case 'selectBase':
                    this.submodule.index.setActiveBaseId(message.baseId);
                    this.reloadGraphUiForActiveBase();
                    await this.rebindActiveBaseViews();
                    break;
                case 'createBase':
                    await this.submodule.index.createBase();
                    this.reloadGraphUiForActiveBase();
                    await this.refreshIndexData();
                    break;
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
                case 'loadAttributes':
                    this.attributesQuery = message.query;
                    await this.sendAttributesPage();
                    break;
                case 'loadTimeline':
                    await this.sendTimelinePage();
                    break;
                case 'loadOverviewCoverage':
                    await this.sendOverviewCoverage();
                    break;
                case 'overviewSearch':
                    await this.sendOverviewSearch(message.query);
                    break;
                case 'loadGraph': {
                    this.graphQuery = message.query;
                    this.graphSlicePending = true;
                    const generation = ++this.graphSliceGeneration;
                    console.log('[reqlan:graph] extension loadGraph', {
                        generation,
                        ready: this.submodule.index.isReady,
                        centerId: message.query.centerId
                    });
                    if (!this.submodule.index.isReady) {
                        // Kick a sync so status updates will deliver the pending slice.
                        void this.submodule.index.syncWorkspace().then(() => {
                            void this.sendIndexStatus();
                        });
                    }
                    await this.runGraphSlice(generation);
                    break;
                }
                case 'openIdea':
                    await openIndexFile(
                        message.fileUri,
                        message.line,
                        message.column,
                        this.submodule.index.getActiveBase()?.descriptor.root
                    );
                    break;
                case 'openExternal':
                    await vscode.env.openExternal(vscode.Uri.parse(message.href));
                    break;
                case 'openExport': {
                    const command =
                        message.format === 'pdf' ? 'reqlan.exportPdf'
                            : message.format === 'markdown' ? 'reqlan.exportMarkdown'
                                : message.format === 'json' ? 'reqlan.exportJson'
                                    : message.format === 'csv' ? 'reqlan.exportCsv'
                                        : 'reqlan.exportHtml';
                    await vscode.commands.executeCommand(command);
                    break;
                }
                case 'dumpFullGraph':
                    await this.sendFullGraph();
                    break;
                case 'persistGraphUiState':
                    await this.persistGraphUiState(message.state);
                    break;
                case 'persistTableUiState':
                    await this.persistTableUiState(message.state);
                    break;
            }
        } catch (error) {
            if (message.type === 'loadGraph') {
                const detail = error instanceof Error ? error.message : 'Failed to load graph.';
                this.graphSlicePending = false;
                this.post({ type: 'error', message: detail });
            } else {
                this.post({
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Ideas Summary request failed.'
                });
            }
        }
    }

    private post(message: ExtensionToWebviewMessage): void {
        safeWebviewPost(this.panel.webview, message);
    }

    private readGraphUiState(): GraphUiPersistedState {
        const key = graphUiWorkspaceStateKey(this.submodule.index.getActiveBaseId());
        const raw =
            this.context.workspaceState.get(key) ??
            this.context.workspaceState.get(GRAPH_UI_WORKSPACE_STATE_KEY);
        return normalizeGraphUiState(raw);
    }

    private postGraphUiState(): void {
        const state = this.readGraphUiState();
        // Keep host query budget in sync so the first loadGraph uses restored values
        // even if the webview posts before it applies graphUiState locally.
        this.graphQuery = {
            ...this.graphQuery,
            maxNodes: state.maxNodes,
            truncationBasis: state.truncationBasis
        };
        this.post({ type: 'graphUiState', state });
    }

    private readTableUiState(): TableUiPersistedState {
        const raw = this.context.workspaceState.get(TABLE_UI_WORKSPACE_STATE_KEY);
        return normalizeTableUiState(raw);
    }

    private postTableUiState(): void {
        const state = this.readTableUiState();
        if (state.ideas.groupBy) {
            this.ideasQuery = { ...this.ideasQuery, groupBy: state.ideas.groupBy };
        }
        if (state.references.groupBy) {
            this.referencesQuery = { ...this.referencesQuery, groupBy: state.references.groupBy };
        }
        this.post({ type: 'tableUiState', state });
    }

    private async persistTableUiState(raw: unknown): Promise<void> {
        const state = normalizeTableUiState(raw);
        await this.context.workspaceState.update(TABLE_UI_WORKSPACE_STATE_KEY, state);
    }

    private postOverviewLinks(): void {
        const site = getPhonebookLink('site');
        const github = getPhonebookLink('github');
        const email = getPhonebookLink('email');
        this.post({
            type: 'overviewLinks',
            links: [
                { id: site.id, label: site.label, href: site.href },
                { id: github.id, label: github.label, href: github.href },
                { id: email.id, label: 'Support', href: email.href }
            ]
        });
    }

    private reloadGraphUiForActiveBase(): void {
        this.postGraphUiState();
    }

    private async persistGraphUiState(raw: unknown): Promise<void> {
        const state = normalizeGraphUiState(raw);
        this.graphQuery = {
            ...this.graphQuery,
            maxNodes: state.maxNodes,
            truncationBasis: state.truncationBasis
        };
        const key = graphUiWorkspaceStateKey(this.submodule.index.getActiveBaseId());
        await this.context.workspaceState.update(key, state);
        await this.context.workspaceState.update(GRAPH_UI_WORKSPACE_STATE_KEY, state);
    }

    private async refreshIndexData(): Promise<void> {
        await this.submodule.index.syncWorkspace();
        await this.rebindActiveBaseViews();
    }

    /** Rebind status/tables/graph to the active base store — no index sync. */
    private async rebindActiveBaseViews(): Promise<void> {
        await this.sendIndexStatus();
        if (this.submodule.index.isReady) {
            this.ideasQuery = { ...this.ideasQuery, page: 0 };
            this.ideasetsQuery = { ...this.ideasetsQuery, page: 0 };
            this.referencesQuery = { ...this.referencesQuery, page: 0 };
            this.attributesQuery = { ...this.attributesQuery, page: 0 };
            await this.sendIdeasPage();
            await this.sendIdeasetsPage();
            await this.sendReferencesPage();
            await this.sendAttributesPage();
            if (this.graphSlicePending || this.graphQuery.centerId) {
                void this.runGraphSlice(++this.graphSliceGeneration);
            }
        }
    }

    private async bootstrapData(): Promise<void> {
        if (this.bootstrapPromise) {
            return this.bootstrapPromise;
        }
        this.bootstrapPromise = this.runBootstrapData().finally(() => {
            this.bootstrapPromise = undefined;
        });
        return this.bootstrapPromise;
    }

    private async runBootstrapData(): Promise<void> {
        if (!this.submodule.index.isReady) {
            await this.submodule.index.syncWorkspace();
        }
        await this.sendIndexStatus();
        if (this.submodule.index.isReady) {
            await this.sendIdeasPage();
            await this.sendIdeasetsPage();
            await this.sendReferencesPage();
            await this.sendAttributesPage();
        }
    }

    private async sendIndexStatus(): Promise<void> {
        const index = this.submodule.index;
        const bases = index.statusByBase().map(({ base, status }) => ({
            id: base.id,
            label: base.label,
            root: base.root,
            ready: status.ready,
            ideaCount: status.ideaCount,
            edgeCount: status.edgeCount,
            fileIssueCount: status.fileIssueCount,
            state: status.state
        }));
        this.post({
            type: 'indexStatus',
            status: toIndexStatusView(index.getStatusSnapshot(), {
                activeBaseId: index.getActiveBaseId(),
                discoveryEmpty: index.discoveryEmpty,
                bases,
                baseRoot: index.getActiveBase()?.descriptor.root
            })
        });
        // Never await the graph build on the status path — sync progress must keep flowing.
        if (this.graphSlicePending && this.submodule.index.isReady) {
            void this.runGraphSlice(this.graphSliceGeneration);
        }
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
                path: this.toDisplayPath(row.path)
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
                path: this.toDisplayPath(row.path)
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
                sourcePath: this.toDisplayPath(row.sourcePath),
                targetPath: row.targetPath ? this.toDisplayPath(row.targetPath) : '—'
            }));
        this.post({
            type: 'referencesPage',
            query: resolvedQuery,
            total,
            rows
        });
    }

    /** Convert an index/base-relative path to a workspace-relative display path. */
    private toDisplayPath(indexedPath: string): string {
        return toWorkspaceDisplayPath(
            indexedPath,
            this.submodule.index.getActiveBase()?.descriptor.root
        );
    }

    private async sendAttributesPage(): Promise<void> {
        if (!this.submodule.index.isReady) {
            return;
        }
        const store = this.submodule.index.indexStore;
        const query = normalizeAttributesQuery(this.attributesQuery);
        const total = await store.countAttributes(query);
        const safePage = clampPage(query.page, total, query.pageSize);
        const resolvedQuery = { ...query, page: safePage };
        const rows = await store.listAttributesPage(resolvedQuery);
        this.post({
            type: 'attributesPage',
            query: resolvedQuery,
            total,
            rows
        });
    }

    private async sendTimelinePage(): Promise<void> {
        const indexEvents = await this.buildIdeaIndexTimelineEvents();
        let gitEvents: Array<{
            id: string;
            source: 'git';
            at: number;
            label: string;
            detail: string;
            ideaId?: string;
            ideaName?: string;
            summary?: string;
            status?: string;
            ideaKind?: string;
            tags?: string[];
            path?: string;
            fileUri: string;
            lineStart: number;
        }> = [];

        if (this.submodule.index.isReady) {
            const rows = await this.submodule.index.indexStore.listRecentGitIdeaEvents(100);
            gitEvents = rows
                .map(row => {
                    const at = Date.parse(row.at);
                    if (!Number.isFinite(at)) {
                        return undefined;
                    }
                    const path = this.toDisplayPath(row.fileUri);
                    return {
                        id: `git:${row.ideaId}:${row.kind}:${row.at}`,
                        source: 'git' as const,
                        at,
                        label: row.kind === 'created' ? 'Created' : 'Modified',
                        detail: row.name,
                        ideaId: row.ideaId,
                        ideaName: row.name,
                        summary: row.summary,
                        status: row.status,
                        ideaKind: row.ideaKind,
                        tags: row.tags,
                        path,
                        fileUri: row.fileUri,
                        lineStart: row.lineStart
                    };
                })
                .filter((event): event is NonNullable<typeof event> => Boolean(event));
        }

        const events = [...gitEvents, ...indexEvents]
            .sort((left, right) => right.at - left.at)
            .slice(0, 150);

        this.post({ type: 'timelinePage', events });
    }

    /** Session index activity expanded to one Timeline event per idea. */
    private async buildIdeaIndexTimelineEvents(): Promise<Array<{
        id: string;
        source: 'index';
        at: number;
        label: string;
        detail: string;
        ideaId?: string;
        ideaName?: string;
        summary?: string;
        status?: string;
        ideaKind?: string;
        tags?: string[];
        path?: string;
        fileUri: string;
        lineStart: number;
    }>> {
        const updates = this.submodule.index.getStatusSnapshot().recentDocumentUpdates ?? [];
        const events: Array<{
            id: string;
            source: 'index';
            at: number;
            label: string;
            detail: string;
            ideaId?: string;
            ideaName?: string;
            summary?: string;
            status?: string;
            ideaKind?: string;
            tags?: string[];
            path?: string;
            fileUri: string;
            lineStart: number;
        }> = [];

        const ideaIds = updates.flatMap(update => (update.ideas ?? []).map(idea => idea.id));
        const byId = new Map<string, Awaited<ReturnType<typeof this.submodule.index.indexStore.getIdea>>>();
        if (this.submodule.index.isReady && ideaIds.length > 0) {
            const ideas = await this.submodule.index.indexStore.getIdeasByIds(ideaIds);
            for (const idea of ideas) {
                byId.set(idea.id, idea);
            }
        }

        for (const update of updates) {
            const path = this.toDisplayPath(update.fileUri);
            const ideas = update.ideas ?? [];
            if (ideas.length === 0) {
                continue;
            }
            for (const idea of ideas) {
                const indexed = byId.get(idea.id);
                events.push({
                    id: `index:idea:${idea.id}:${update.at}`,
                    source: 'index',
                    at: update.at,
                    label: 'Reindexed',
                    detail: idea.name,
                    ideaId: idea.id,
                    ideaName: idea.name,
                    summary: indexed?.summary,
                    status: indexed?.status,
                    ideaKind: indexed?.kind,
                    tags: indexed?.tags,
                    path,
                    fileUri: update.fileUri,
                    lineStart: idea.lineStart
                });
            }
        }
        return events;
    }

    private async sendOverviewCoverage(): Promise<void> {
        const generation = ++this.coverageGeneration;
        const baseRoot = this.submodule.index.getActiveBase()?.descriptor.root;
        if (!baseRoot) {
            this.post({
                type: 'overviewCoverage',
                error: 'No active workspace base is selected.'
            });
            return;
        }
        if (!this.submodule.index.isReady) {
            this.post({
                type: 'overviewCoverage',
                error: 'Coverage is available once the workspace index is ready.'
            });
            return;
        }

        try {
            const scores = await computeOverviewCoverageScores({
                baseRoot,
                store: this.submodule.index.indexStore,
                shouldCancel: () => generation !== this.coverageGeneration
            });

            if (generation !== this.coverageGeneration) {
                return;
            }

            // Plain object — avoid any residual proxies before postMessage.
            this.post({
                type: 'overviewCoverage',
                scores: {
                    ideaCount: scores.ideaCount,
                    rqFileCount: scores.rqFileCount,
                    eligibleNonRqFileCount: scores.eligibleNonRqFileCount,
                    referencedEligibleFileCount: scores.referencedEligibleFileCount,
                    fileCoveragePct: scores.fileCoveragePct,
                    distinctFileReferenceCount: scores.distinctFileReferenceCount,
                    totalLoc: scores.totalLoc,
                    ideasPerKLoc: scores.ideasPerKLoc,
                    locTruncated: scores.locTruncated,
                    calculatedAt: scores.calculatedAt
                }
            });
        } catch (error) {
            if (generation !== this.coverageGeneration) {
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            this.post({
                type: 'overviewCoverage',
                error: `Could not calculate coverage: ${message}`
            });
        }
    }

    private async sendOverviewSearch(rawQuery: string): Promise<void> {
        const query = rawQuery.trim();
        if (!query || !this.submodule.index.isReady) {
            this.post({
                type: 'overviewSearchResult',
                result: { query, sections: [] }
            });
            return;
        }

        const store = this.submodule.index.indexStore;
        const sampleSize = 5;

        const ideasQuery = normalizeIdeasQuery({
            ...DEFAULT_IDEAS_QUERY,
            search: query,
            pageSize: sampleSize
        });
        const ideasetsQuery = normalizeIdeasetsQuery({
            ...DEFAULT_IDEASETS_QUERY,
            search: query,
            pageSize: sampleSize
        });
        const referencesQuery = normalizeReferencesQuery({
            ...DEFAULT_REFERENCES_QUERY,
            search: query,
            pageSize: sampleSize
        });
        const attributesQuery = normalizeAttributesQuery({
            ...DEFAULT_ATTRIBUTES_QUERY,
            search: query,
            pageSize: sampleSize,
            sortBy: 'ideaCount',
            sortDir: 'desc'
        });

        const [
            ideasTotal,
            ideasRows,
            ideasetsTotal,
            ideasetsRows,
            referencesTotal,
            referencesRows,
            attributesTotal,
            attributesRows
        ] = await Promise.all([
            store.countIdeas(ideasQuery),
            store.listIdeasPage(ideasQuery),
            store.countIdeasets(ideasetsQuery),
            store.listIdeasetsPage(ideasetsQuery),
            store.countReferences(referencesQuery),
            store.listReferencesPage(referencesQuery),
            store.countAttributes(attributesQuery),
            store.listAttributesPage(attributesQuery)
        ]);

        this.post({
            type: 'overviewSearchResult',
            result: {
                query,
                sections: [
                    {
                        surface: 'ideas',
                        label: 'Ideas',
                        total: ideasTotal,
                        hits: ideasRows.map(row => ({
                            kind: 'idea' as const,
                            title: row.title,
                            detail: this.toDisplayPath(row.path),
                            fileUri: row.fileUri,
                            lineStart: row.lineStart
                        }))
                    },
                    {
                        surface: 'ideasets',
                        label: 'Ideasets',
                        total: ideasetsTotal,
                        hits: ideasetsRows.map(row => ({
                            kind: 'ideaset' as const,
                            title: row.name,
                            detail: this.toDisplayPath(row.path),
                            fileUri: row.fileUri,
                            lineStart: row.lineStart
                        }))
                    },
                    {
                        surface: 'attributes',
                        label: 'Attributes',
                        total: attributesTotal,
                        hits: attributesRows.map(row => ({
                            kind: 'attribute' as const,
                            title: row.key,
                            detail: `${row.ideaCount} ideas · ${row.valueCount} values`,
                            attributeKey: row.key
                        }))
                    },
                    {
                        surface: 'references',
                        label: 'References',
                        total: referencesTotal,
                        hits: referencesRows.map(row => ({
                            kind: 'reference' as const,
                            title: `${row.sourceName} → ${row.targetName}`,
                            detail: `${this.toDisplayPath(row.sourcePath)} · ${row.referenceType}`,
                            fileUri: row.referenceType === 'file' && row.targetFileUri
                                ? row.targetFileUri
                                : row.sourceFileUri,
                            lineStart: row.referenceType === 'file' ? 0 : row.sourceLineStart
                        }))
                    }
                ]
            }
        });
    }

    private async runGraphSlice(generation: number): Promise<void> {
        if (generation !== this.graphSliceGeneration || !this.graphSlicePending) {
            console.log('[reqlan:graph] extension runGraphSlice skip', {
                generation,
                current: this.graphSliceGeneration,
                pending: this.graphSlicePending
            });
            return;
        }

        if (!this.submodule.index.isReady) {
            console.log('[reqlan:graph] extension waiting for index', {
                generation,
                state: this.submodule.index.getStatusSnapshot().state
            });
            return;
        }

        const query = normalizeGraphQuery(this.graphQuery);
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
            if (generation !== this.graphSliceGeneration) {
                return;
            }
            this.graphSlicePending = false;
            console.log('[reqlan:graph] extension posting graphSlice', {
                generation,
                nodes: slice.nodes.length,
                edges: slice.edges.length,
                centerId: slice.centerId
            });
            this.post({
                type: 'graphSlice',
                slice: await toGraphSliceView(
                    store,
                    slice,
                    this.submodule.index.getActiveBase()?.descriptor.root
                )
            });
        } catch (error) {
            if (generation !== this.graphSliceGeneration) {
                return;
            }
            this.graphSlicePending = false;
            const detail = error instanceof Error ? error.message : 'Failed to load graph.';
            console.error('[reqlan:graph] extension slice failed', detail);
            this.post({ type: 'error', message: detail });
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

function toWorkspaceDisplayPath(indexedPath: string, baseRoot?: string): string {
    if (!indexedPath || indexedPath === '—') {
        return indexedPath;
    }
    if (indexedPath.includes('://') || indexedPath.startsWith('/') || /^[A-Za-z]:/.test(indexedPath)) {
        return vscode.workspace.asRelativePath(indexedPath);
    }
    if (!baseRoot) {
        return indexedPath.replace(/\\/g, '/');
    }
    return vscode.workspace.asRelativePath(join(baseRoot, indexedPath));
}

function normalizeGraphQuery(query: GraphViewQuery): GraphViewQuery {
    const truncationBasis =
        query.truncationBasis === 'git-modified' || query.truncationBasis === 'git-created'
            ? query.truncationBasis
            : 'path';
    return {
        centerId: query.centerId?.trim() || undefined,
        search: query.search?.trim() || undefined,
        pathFilter: query.pathFilter?.trim() || undefined,
        statusFilter: normalizeGraphFilterList(query.statusFilter),
        tagFilter: normalizeGraphFilterList(query.tagFilter),
        includeIndirect: Boolean(query.includeIndirect),
        includeWildcardRefs: query.includeWildcardRefs !== false,
        maxNodes: Math.min(Math.max(1, query.maxNodes ?? GRAPH_MAX_NODES), GRAPH_NODES_HARD_CAP),
        truncationBasis
    };
}

function normalizeGraphFilterList(value: string[] | string | undefined): string[] | undefined {
    const list = Array.isArray(value)
        ? value.map(entry => String(entry).trim()).filter(Boolean)
        : typeof value === 'string' && value.trim()
            ? [value.trim()]
            : [];
    return list.length > 0 ? list : undefined;
}

function hasGraphFilters(query: GraphViewQuery): boolean {
    return Boolean(
        query.search ||
        query.pathFilter ||
        (query.statusFilter && query.statusFilter.length > 0) ||
        (query.tagFilter && query.tagFilter.length > 0)
    );
}

async function toGraphSliceView(
    store: AnalyticalSubmodule['index']['indexStore'],
    slice: AnalyticalGraphViewSlice,
    baseRoot?: string
): Promise<GraphViewSlice> {
    let hotspotBand: 'low' | 'medium' | 'high' | undefined;
    if (slice.centerId) {
        const center = await store.getIdea(slice.centerId);
        const refs = await store.listReferencesForIdea(slice.centerId);
        const inbound = refs.filter(row => row.direction === 'inbound').length;
        const outbound = refs.filter(row => row.direction === 'outbound').length;
        const unresolved = await store.countUnresolvedForIdea(slice.centerId);
        const parents = (await store.listAncestorChain(slice.centerId, 1)).length;
        const synthesis = synthesizeFocusContext(
            buildFocusSignals({
                focusIdeaId: slice.centerId,
                status: center?.status,
                parentCount: parents,
                inboundCount: inbound,
                outboundCount: outbound,
                unresolvedCount: unresolved,
                createdAt: center?.gitCreatedAt,
                modifiedAt: center?.gitModifiedAt
            })
        );
        hotspotBand = hotspotBandFromRisk(synthesis.aiRisk);
    }
    return {
        ...slice,
        nodes: slice.nodes.map(node => ({
            ...node,
            path: toWorkspaceDisplayPath(node.fileUri, baseRoot),
            hotspotBand: node.id === slice.centerId ? hotspotBand : undefined
        }))
    };
}

async function defaultGraphCenterId(submodule: AnalyticalSubmodule): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !submodule.index.isReady) {
        return undefined;
    }
    const fileUri = toIndexFileUri(
        editor.document.uri,
        submodule.index.getActiveBase()?.descriptor.root
    );
    const ideas = await submodule.index.indexStore.getIdeasInFile(fileUri);
    return ideas[0]?.id;
}

/**
 * Preserve typed search/filter text through the host round-trip.
 * Do not trim: trimming collapses "foo " → "foo" and blocks spaces in controlled inputs.
 * SQL matchers already treat whitespace-only as empty via their own `.trim()` checks.
 */
function normalizeIdeasQuery(query: IdeasTableQuery): IdeasTableQuery {
    return {
        page: Math.max(0, query.page),
        pageSize: query.pageSize || IDEAS_PAGE_SIZE,
        search: preserveFilterText(query.search),
        sortBy: query.sortBy ?? 'path',
        sortDir: query.sortDir ?? 'asc',
        attributeColumns: [...new Set(query.attributeColumns)],
        referenceFilters: dedupeReferenceFilters(query.referenceFilters ?? []),
        columnFilters: normalizeColumnFilters(query.columnFilters),
        groupBy: query.groupBy === 'kind' ? 'kind' : undefined
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
        search: preserveFilterText(query.search),
        sortBy: query.sortBy ?? 'path',
        sortDir: query.sortDir ?? 'asc',
        columnFilters: normalizeColumnFilters(query.columnFilters)
    };
}

function normalizeReferencesQuery(query: ReferencesTableQuery): ReferencesTableQuery {
    return {
        page: Math.max(0, query.page),
        pageSize: query.pageSize || REFERENCES_PAGE_SIZE,
        search: preserveFilterText(query.search),
        sortBy: query.sortBy ?? 'source',
        sortDir: query.sortDir ?? 'asc',
        columnFilters: normalizeColumnFilters(query.columnFilters),
        groupBy: query.groupBy === 'type' ? 'type' : undefined
    };
}

function normalizeAttributesQuery(query: AttributesTableQuery): AttributesTableQuery {
    return {
        page: Math.max(0, query.page),
        pageSize: query.pageSize || ATTRIBUTES_PAGE_SIZE,
        search: preserveFilterText(query.search),
        sortBy: query.sortBy ?? 'ideaCount',
        sortDir: query.sortDir ?? 'desc',
        columnFilters: normalizeColumnFilters(query.columnFilters)
    };
}

export function toIndexStatusView(
    snapshot: IndexStatusSnapshot,
    extras?: {
        activeBaseId?: string;
        discoveryEmpty?: boolean;
        bases?: BaseStatusView[];
        baseRoot?: string;
    }
): IndexStatusView {
    const recentActivity = [
        ...snapshot.recentDocumentUpdates.flatMap(update => {
            const ideas = update.ideas ?? [];
            if (ideas.length === 0) {
                return [{
                    label: 'Indexed',
                    detail: toWorkspaceDisplayPath(update.fileUri, extras?.baseRoot),
                    at: update.at
                }];
            }
            return ideas.slice(0, 8).map(idea => ({
                label: 'Reindexed',
                detail: idea.name,
                at: update.at
            }));
        }),
        ...snapshot.recentWorkspaceChanges.map(change => ({
            label: `File ${change.change}`,
            detail: toWorkspaceDisplayPath(change.fileUri, extras?.baseRoot),
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
        recentActivity,
        activeBaseId: extras?.activeBaseId,
        discoveryEmpty: extras?.discoveryEmpty,
        bases: extras?.bases
    };
}

function clampPage(page: number, total: number, pageSize: number): number {
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    return Math.min(Math.max(0, page), maxPage);
}


import type { ExtensionToWebviewMessage } from '../../../src/webview_module/shared/messages.js';
import type {
    AttributesTableQuery,
    AttributeTableRow,
    GraphUiPersistedState,
    GraphViewQuery,
    GraphViewSlice,
    IdeaTableRow,
    IdeasTableQuery,
    IdeasetsTableQuery,
    IdeasetTableRow,
    IndexStatusView,
    OverviewLink,
    OverviewSearchResult,
    OverviewCoverageScores,
    ReferenceTableRow,
    ReferencesTableQuery,
    TableUiPersistedState,
    TimelineEventView
} from '../../../src/webview_module/shared/messages.js';
import {
    DEFAULT_GRAPH_UI_STATE,
    normalizeGraphUiState
} from '../../../src/webview_module/shared/graph-ui-state.js';
import {
    DEFAULT_TABLE_UI_STATE,
    normalizeTableUiState
} from '../../../src/webview_module/shared/table-ui-state.js';
import { createDebounced } from '../lib/debounce.js';
import {
    defaultAttributesQuery,
    defaultGraphQuery,
    defaultIdeasQuery,
    defaultIdeasetsQuery,
    defaultReferencesQuery
} from '../lib/default-queries.js';
import { indexStatusText } from '../lib/index-status-text.js';
import { graphLog } from '../lib/graph-debug.js';
import type { Tab } from '../lib/tabs.js';
import { TABS } from '../lib/tabs.js';
import { getVsCodeApi, postToExtension } from '../lib/vscode.js';

const VALID_TABS = new Set(TABS.map(tab => tab.id));

export class AppState {
    tab = $state({
        activeTab: 'overview' as Tab,
        statusText: 'Loading index…',
        statusError: false
    });

    index = $state({
        status: undefined as IndexStatusView | undefined
    });

    overview = $state({
        links: [] as OverviewLink[],
        search: undefined as OverviewSearchResult | undefined,
        searching: false,
        coverage: undefined as OverviewCoverageScores | undefined,
        coverageError: undefined as string | undefined,
        coverageLoading: false,
        coverageBaseId: undefined as string | undefined
    });

    ideas = $state({
        query: defaultIdeasQuery(),
        total: 0,
        rows: [] as IdeaTableRow[]
    });

    ideasets = $state({
        query: defaultIdeasetsQuery(),
        total: 0,
        rows: [] as IdeasetTableRow[]
    });

    references = $state({
        query: defaultReferencesQuery(),
        total: 0,
        rows: [] as ReferenceTableRow[]
    });

    attributes = $state({
        query: defaultAttributesQuery(),
        total: 0,
        rows: [] as AttributeTableRow[]
    });

    timeline = $state({
        events: [] as TimelineEventView[],
        loading: false
    });

    tableUi = $state({
        ...DEFAULT_TABLE_UI_STATE,
        ideas: { ...DEFAULT_TABLE_UI_STATE.ideas, visibleColumns: [...DEFAULT_TABLE_UI_STATE.ideas.visibleColumns] },
        ideasets: { visibleColumns: [...DEFAULT_TABLE_UI_STATE.ideasets.visibleColumns] },
        attributes: { visibleColumns: [...DEFAULT_TABLE_UI_STATE.attributes.visibleColumns] },
        references: {
            ...DEFAULT_TABLE_UI_STATE.references,
            visibleColumns: [...DEFAULT_TABLE_UI_STATE.references.visibleColumns]
        },
        bases: { visibleColumns: [...DEFAULT_TABLE_UI_STATE.bases.visibleColumns] }
    } as TableUiPersistedState);

    tableUiHydrated = $state(false);

    graph = $state({
        query: defaultGraphQuery(),
        slice: undefined as GraphViewSlice | undefined,
        loading: false,
        rendering: false,
        error: undefined as string | undefined,
        /** Key + Controls panel state; hydrated from workspaceState via graphUiState. */
        ui: { ...DEFAULT_GRAPH_UI_STATE, physics: { ...DEFAULT_GRAPH_UI_STATE.physics }, hiddenNodeTypes: [] as GraphUiPersistedState['hiddenNodeTypes'] },
        /** True after the extension has delivered graphUiState at least once. */
        uiHydrated: false
    });

    dump = $state({
        output: '',
        visible: false
    });

    private extensionConnected = false;
    private extensionConnectTimer: ReturnType<typeof setTimeout> | undefined;
    private graphLoadTimeout: ReturnType<typeof setTimeout> | undefined;
    private ideasSearchDebounce = createDebounced((query: IdeasTableQuery) => this.loadIdeas(query), 250);
    private ideasetsSearchDebounce = createDebounced((query: IdeasetsTableQuery) => this.loadIdeasets(query), 250);
    private referencesSearchDebounce = createDebounced((query: ReferencesTableQuery) => this.loadReferences(query), 250);
    private attributesSearchDebounce = createDebounced((query: AttributesTableQuery) => this.loadAttributes(query), 250);
    private overviewSearchDebounce = createDebounced((query: string) => this.flushOverviewSearch(query), 250);
    private graphUiPersistDebounce = createDebounced(() => this.flushGraphUiPersist(), 200);
    private tableUiPersistDebounce = createDebounced(() => this.flushTableUiPersist(), 200);

    setStatus(message: string, error: boolean): void {
        this.tab.statusText = message;
        this.tab.statusError = error;
    }

    setTab(tab: Tab): void {
        this.tab.activeTab = tab;
        getVsCodeApi().setState({ activeTab: tab });
        if (tab === 'graph') {
            this.requestGraph();
        }
        if (tab === 'attributes') {
            this.loadAttributes(this.attributes.query);
        }
        if (tab === 'ideas') {
            this.loadIdeas(this.ideas.query);
        }
        if (tab === 'ideasets') {
            this.loadIdeasets(this.ideasets.query);
        }
        if (tab === 'references') {
            this.loadReferences(this.references.query);
        }
        if (tab === 'timeline') {
            this.loadTimeline();
        }
    }

    openIdea(fileUri: string, line: number, column = 0): void {
        postToExtension({ type: 'openIdea', fileUri, line, column });
    }

    openExternal(href: string): void {
        postToExtension({ type: 'openExternal', href });
    }

    openExport(format?: 'html' | 'pdf' | 'markdown' | 'json' | 'csv'): void {
        postToExtension({ type: 'openExport', format });
    }

    overviewSearch(query: string): void {
        const trimmed = query.trim();
        if (!trimmed) {
            this.overview.search = undefined;
            this.overview.searching = false;
            this.overviewSearchDebounce.cancel();
            return;
        }
        this.overview.searching = true;
        this.overviewSearchDebounce.schedule(trimmed);
    }

    private flushOverviewSearch(query: string): void {
        postToExtension({ type: 'overviewSearch', query });
    }

    openOverviewSurface(
        surface: 'ideas' | 'ideasets' | 'attributes' | 'references',
        query: string
    ): void {
        const search = query.trim() || undefined;
        if (surface === 'ideas') {
            this.ideas.query = { ...this.ideas.query, page: 0, search };
            this.setTab('ideas');
            return;
        }
        if (surface === 'ideasets') {
            this.ideasets.query = { ...this.ideasets.query, page: 0, search };
            this.setTab('ideasets');
            return;
        }
        if (surface === 'attributes') {
            this.attributes.query = { ...this.attributes.query, page: 0, search };
            this.setTab('attributes');
            return;
        }
        this.references.query = { ...this.references.query, page: 0, search };
        this.setTab('references');
    }

    searchFromOverview(search: string): void {
        this.openOverviewSurface('ideas', search);
    }

    loadTimeline(): void {
        this.timeline.loading = true;
        postToExtension({ type: 'loadTimeline' });
    }

    /**
     * Lazy coverage scores — only called when the Overview section is expanded.
     * per overview_coverage_scores
     */
    loadOverviewCoverage(force = false): void {
        const baseId = this.index.status?.activeBaseId;
        if (
            !force
            && this.overview.coverage
            && this.overview.coverageBaseId === baseId
            && !this.overview.coverageLoading
        ) {
            return;
        }
        this.overview.coverageLoading = true;
        this.overview.coverageError = undefined;
        this.overview.coverageBaseId = baseId;
        postToExtension({ type: 'loadOverviewCoverage' });
    }

    openAttributeInIdeas(key: string): void {
        const attributeColumns = this.ideas.query.attributeColumns.includes(key)
            ? this.ideas.query.attributeColumns
            : [...this.ideas.query.attributeColumns, key];
        const next: IdeasTableQuery = {
            ...this.ideas.query,
            page: 0,
            attributeColumns,
            sortBy: `attr:${key}`,
            sortDir: 'asc'
        };
        this.ideas.query = next;
        this.setTab('ideas');
    }

    loadIdeas(query: IdeasTableQuery): void {
        this.ideas.query = query;
        postToExtension({ type: 'loadIdeas', query });
    }

    onIdeasQueryChange(query: IdeasTableQuery): void {
        if (query.search !== this.ideas.query.search) {
            this.ideas.query = query;
            this.ideasSearchDebounce.schedule(query);
            return;
        }
        this.loadIdeas(query);
    }

    loadIdeasets(query: IdeasetsTableQuery): void {
        this.ideasets.query = query;
        postToExtension({ type: 'loadIdeasets', query });
    }

    onIdeasetsQueryChange(query: IdeasetsTableQuery): void {
        if (query.search !== this.ideasets.query.search) {
            this.ideasets.query = query;
            this.ideasetsSearchDebounce.schedule(query);
            return;
        }
        this.loadIdeasets(query);
    }

    loadReferences(query: ReferencesTableQuery): void {
        this.references.query = query;
        postToExtension({ type: 'loadReferences', query });
    }

    onReferencesQueryChange(query: ReferencesTableQuery): void {
        if (query.search !== this.references.query.search) {
            this.references.query = query;
            this.referencesSearchDebounce.schedule(query);
            return;
        }
        this.loadReferences(query);
    }

    loadAttributes(query: AttributesTableQuery): void {
        this.attributes.query = query;
        postToExtension({ type: 'loadAttributes', query });
    }

    onAttributesQueryChange(query: AttributesTableQuery): void {
        if (query.search !== this.attributes.query.search) {
            this.attributes.query = query;
            this.attributesSearchDebounce.schedule(query);
            return;
        }
        this.loadAttributes(query);
    }

    requestGraph(options?: { force?: boolean }): void {
        if (this.graph.loading && !options?.force) {
            graphLog('requestGraph skip — already loading');
            return;
        }
        if (!options?.force && this.graph.slice && !this.graph.error) {
            graphLog('requestGraph skip — slice already present', {
                nodes: this.graph.slice.nodes.length
            });
            return;
        }
        this.loadGraph(this.graph.query);
    }

    loadGraph(query: GraphViewQuery): void {
        this.graph.query = query;
        this.graph.loading = true;
        this.graph.rendering = false;
        this.graph.error = undefined;
        clearTimeout(this.graphLoadTimeout);
        this.graphLoadTimeout = setTimeout(() => {
            if (!this.graph.loading) {
                return;
            }
            graphLog('loadGraph timed out waiting for extension');
            this.graph.loading = false;
            this.graph.error =
                'Graph load timed out — is the index ready? Try Refresh index, then reopen the Graph tab.';
        }, 20_000);
        graphLog('loadGraph → extension', {
            centerId: query.centerId,
            search: query.search,
            includeIndirect: query.includeIndirect,
            indexReady: this.index.status?.ready ?? false
        });
        try {
            postToExtension({ type: 'loadGraph', query });
        } catch (error) {
            clearTimeout(this.graphLoadTimeout);
            const detail = error instanceof Error ? error.message : String(error);
            graphLog('loadGraph postMessage failed', { detail });
            this.graph.loading = false;
            this.graph.rendering = false;
            this.graph.error = `Failed to request graph: ${detail}`;
        }
    }

    onGraphRendered(): void {
        this.graph.rendering = false;
    }

    /**
     * Merge Key/Controls UI fields, sync node-budget into the graph query, and
     * debounce-persist to ExtensionContext.workspaceState.
     */
    patchGraphUi(partial: Partial<GraphUiPersistedState>): GraphUiPersistedState {
        const next = normalizeGraphUiState({
            ...this.graph.ui,
            ...partial,
            physics: partial.physics
                ? { ...this.graph.ui.physics, ...partial.physics }
                : this.graph.ui.physics,
            hiddenNodeTypes: partial.hiddenNodeTypes ?? this.graph.ui.hiddenNodeTypes
        });
        this.graph.ui = next;
        if (
            this.graph.query.maxNodes !== next.maxNodes ||
            this.graph.query.truncationBasis !== next.truncationBasis
        ) {
            this.graph.query = {
                ...this.graph.query,
                maxNodes: next.maxNodes,
                truncationBasis: next.truncationBasis
            };
        }
        if (this.graph.uiHydrated) {
            this.graphUiPersistDebounce.schedule();
        }
        return next;
    }

    patchTableUi(partial: Partial<TableUiPersistedState>): TableUiPersistedState {
        const next = normalizeTableUiState({
            ...this.tableUi,
            ...partial,
            ideas: partial.ideas ? { ...this.tableUi.ideas, ...partial.ideas } : this.tableUi.ideas,
            ideasets: partial.ideasets ? { ...this.tableUi.ideasets, ...partial.ideasets } : this.tableUi.ideasets,
            attributes: partial.attributes
                ? { ...this.tableUi.attributes, ...partial.attributes }
                : this.tableUi.attributes,
            references: partial.references
                ? { ...this.tableUi.references, ...partial.references }
                : this.tableUi.references,
            bases: partial.bases ? { ...this.tableUi.bases, ...partial.bases } : this.tableUi.bases
        });
        this.tableUi = next;
        if (this.tableUiHydrated) {
            this.tableUiPersistDebounce.schedule();
        }
        return next;
    }

    private applyGraphUiState(raw: unknown): void {
        const state = normalizeGraphUiState(raw);
        this.graph.ui = state;
        this.graph.uiHydrated = true;
        this.graph.query = {
            ...this.graph.query,
            maxNodes: state.maxNodes,
            truncationBasis: state.truncationBasis
        };
    }

    private applyTableUiState(raw: unknown): void {
        const state = normalizeTableUiState(raw);
        this.tableUi = state;
        this.tableUiHydrated = true;
        if (state.ideas.groupBy) {
            this.ideas.query = { ...this.ideas.query, groupBy: state.ideas.groupBy };
        }
        if (state.references.groupBy) {
            this.references.query = { ...this.references.query, groupBy: state.references.groupBy };
        }
    }

    private flushGraphUiPersist(): void {
        if (!this.graph.uiHydrated) {
            return;
        }
        postToExtension({ type: 'persistGraphUiState', state: this.graph.ui });
    }

    private flushTableUiPersist(): void {
        if (!this.tableUiHydrated) {
            return;
        }
        postToExtension({ type: 'persistTableUiState', state: this.tableUi });
    }

    exportGraph(): void {
        this.dump.output = 'Loading full graph…';
        this.dump.visible = true;
        postToExtension({ type: 'dumpFullGraph' });
    }

    selectBase(baseId: string): void {
        postToExtension({ type: 'selectBase', baseId });
    }

    createBase(): void {
        postToExtension({ type: 'createBase' });
    }

    refreshIndex(): void {
        postToExtension({ type: 'refreshIndex' });
    }

    cancelIndexSync(): void {
        postToExtension({ type: 'cancelIndexSync' });
    }

    clearAndRebuildIndex(): void {
        postToExtension({ type: 'clearAndRebuildIndex' });
    }

    handleExtensionMessage(message: ExtensionToWebviewMessage): void {
        this.extensionConnected = true;
        clearTimeout(this.extensionConnectTimer);

        switch (message.type) {
            case 'indexStatus': {
                const wasReady = this.index.status?.ready ?? false;
                const previousBaseId = this.index.status?.activeBaseId;
                this.index.status = message.status;
                if (message.status.activeBaseId !== previousBaseId) {
                    this.overview.coverage = undefined;
                    this.overview.coverageError = undefined;
                    this.overview.coverageBaseId = undefined;
                    this.overview.coverageLoading = false;
                }
                {
                    const { text, error } = indexStatusText(message.status);
                    this.setStatus(text, error);
                }
                if (
                    message.status.ready &&
                    !wasReady &&
                    this.tab.activeTab === 'graph' &&
                    !this.graph.slice
                ) {
                    graphLog('index became ready — loading graph');
                    this.requestGraph({ force: true });
                }
                break;
            }
            case 'ideasPage':
                this.ideas.query = message.query;
                this.ideas.total = message.total;
                this.ideas.rows = message.rows;
                break;
            case 'ideasetsPage':
                this.ideasets.query = message.query;
                this.ideasets.total = message.total;
                this.ideasets.rows = message.rows;
                break;
            case 'referencesPage':
                this.references.query = message.query;
                this.references.total = message.total;
                this.references.rows = message.rows;
                break;
            case 'attributesPage':
                this.attributes.query = message.query;
                this.attributes.total = message.total;
                this.attributes.rows = message.rows;
                break;
            case 'timelinePage':
                this.timeline.events = message.events;
                this.timeline.loading = false;
                break;
            case 'overviewSearchResult':
                this.overview.search = message.result;
                this.overview.searching = false;
                break;
            case 'overviewCoverage':
                if (message.scores) {
                    this.overview.coverage = message.scores;
                    this.overview.coverageError = undefined;
                } else if (message.error) {
                    this.overview.coverageError = message.error;
                }
                this.overview.coverageLoading = false;
                break;
            case 'overviewLinks':
                this.overview.links = message.links;
                break;
            case 'graphSlice':
                clearTimeout(this.graphLoadTimeout);
                graphLog('graphSlice received', {
                    nodes: message.slice.nodes.length,
                    edges: message.slice.edges.length,
                    centerId: message.slice.centerId,
                    truncated: message.slice.truncated
                });
                this.graph.query = message.slice.query;
                this.graph.slice = message.slice;
                this.graph.loading = false;
                this.graph.error = undefined;
                this.graph.rendering = true;
                break;
            case 'fullGraph':
                this.dump.visible = true;
                this.dump.output = JSON.stringify({
                    ideaCount: message.ideaCount,
                    edgeCount: message.edgeCount,
                    ideas: JSON.parse(message.ideasJson),
                    edges: JSON.parse(message.edgesJson)
                }, null, 2);
                break;
            case 'graphUiState':
                this.applyGraphUiState(message.state);
                if (this.tab.activeTab === 'graph') {
                    this.requestGraph();
                }
                break;
            case 'tableUiState':
                this.applyTableUiState(message.state);
                break;
            case 'navigate': {
                const intent = message.intent;
                if (intent.activeTab && VALID_TABS.has(intent.activeTab as Tab)) {
                    this.setTab(intent.activeTab as Tab);
                }
                if (intent.pathFilter) {
                    this.ideas.query = {
                        ...this.ideas.query,
                        page: 0,
                        search: intent.pathFilter
                    };
                    this.loadIdeas(this.ideas.query);
                }
                if (intent.referenceFilters?.length) {
                    this.ideas.query = {
                        ...this.ideas.query,
                        page: 0,
                        referenceFilters: intent.referenceFilters
                    };
                    this.loadIdeas(this.ideas.query);
                }
                if (intent.centerId || intent.includeIndirect !== undefined || intent.pathFilter) {
                    this.graph.query = {
                        ...this.graph.query,
                        centerId: intent.centerId ?? this.graph.query.centerId,
                        includeIndirect: intent.includeIndirect ?? this.graph.query.includeIndirect,
                        pathFilter: intent.pathFilter ?? this.graph.query.pathFilter
                    };
                    this.requestGraph({ force: true });
                }
                break;
            }
            case 'error':
                clearTimeout(this.graphLoadTimeout);
                graphLog('extension error', { message: message.message, wasLoading: this.graph.loading });
                if (this.graph.loading) {
                    this.graph.loading = false;
                    this.graph.rendering = false;
                    this.graph.error = message.message;
                }
                if (this.overview.coverageLoading) {
                    this.overview.coverageLoading = false;
                    this.overview.coverageError = message.message;
                }
                if (this.timeline.loading) {
                    this.timeline.loading = false;
                }
                this.setStatus(message.message, true);
                break;
        }
    }

    init(): () => void {
        const onMessage = (event: MessageEvent): void => {
            this.handleExtensionMessage(event.data as ExtensionToWebviewMessage);
        };
        window.addEventListener('message', onMessage);

        const saved = getVsCodeApi().getState() as { activeTab?: Tab } | undefined;
        if (saved?.activeTab && VALID_TABS.has(saved.activeTab)) {
            this.tab.activeTab = saved.activeTab;
        }

        requestAnimationFrame(() => {
            postToExtension({ type: 'ready' });
        });

        this.extensionConnectTimer = setTimeout(() => {
            if (!this.extensionConnected) {
                this.setStatus(
                    'Extension not responding — close this panel and run “Open Ideas Summary” again.',
                    true
                );
            }
        }, 5_000);

        return () => {
            window.removeEventListener('message', onMessage);
            clearTimeout(this.extensionConnectTimer);
            clearTimeout(this.graphLoadTimeout);
            this.ideasSearchDebounce.cancel();
            this.ideasetsSearchDebounce.cancel();
            this.referencesSearchDebounce.cancel();
            this.attributesSearchDebounce.cancel();
            this.overviewSearchDebounce.cancel();
            this.graphUiPersistDebounce.cancel();
            this.tableUiPersistDebounce.cancel();
            this.flushGraphUiPersist();
            this.flushTableUiPersist();
        };
    }
}

export const app = new AppState();

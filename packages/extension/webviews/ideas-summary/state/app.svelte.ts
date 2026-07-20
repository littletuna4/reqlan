import type { ExtensionToWebviewMessage } from '../../../src/webview_module/shared/messages.js';
import type {
    GraphViewQuery,
    GraphViewSlice,
    IdeaTableRow,
    IdeasTableQuery,
    IdeasetsTableQuery,
    IdeasetTableRow,
    IndexStatusView,
    ReferenceTableRow,
    ReferencesTableQuery
} from '../../../src/webview_module/shared/messages.js';
import { createDebounced } from '../lib/debounce.js';
import {
    defaultGraphQuery,
    defaultIdeasQuery,
    defaultIdeasetsQuery,
    defaultReferencesQuery
} from '../lib/default-queries.js';
import { indexStatusText } from '../lib/index-status-text.js';
import { graphLog } from '../lib/graph-debug.js';
import type { Tab } from '../lib/tabs.js';
import { getVsCodeApi, postToExtension } from '../lib/vscode.js';

export class AppState {
    tab = $state({
        activeTab: 'index' as Tab,
        statusText: 'Loading index…',
        statusError: false
    });

    index = $state({
        status: undefined as IndexStatusView | undefined
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

    graph = $state({
        query: defaultGraphQuery(),
        slice: undefined as GraphViewSlice | undefined,
        loading: false,
        rendering: false,
        error: undefined as string | undefined
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
    }

    openIdea(fileUri: string, line: number, column = 0): void {
        postToExtension({ type: 'openIdea', fileUri, line, column });
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

    exportGraph(): void {
        this.dump.output = 'Loading full graph…';
        this.dump.visible = true;
        postToExtension({ type: 'dumpFullGraph' });
    }

    handleExtensionMessage(message: ExtensionToWebviewMessage): void {
        this.extensionConnected = true;
        clearTimeout(this.extensionConnectTimer);

        switch (message.type) {
            case 'indexStatus': {
                const wasReady = this.index.status?.ready ?? false;
                this.index.status = message.status;
                {
                    const { text, error } = indexStatusText(message.status);
                    this.setStatus(text, error);
                }
                // Only on the transition to ready — avoids spamming loadGraph on
                // every status tick while a request is already in flight.
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
            case 'navigate': {
                const intent = message.intent;
                if (intent.activeTab) {
                    this.setTab(intent.activeTab);
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
                this.setStatus(message.message, true);
                break;
        }
    }

    init(): () => void {
        // Attach the message listener synchronously before any child onMount can
        // post (Svelte runs child onMount before parent). Lost replies otherwise
        // leave loading flags stuck forever.
        const onMessage = (event: MessageEvent): void => {
            this.handleExtensionMessage(event.data as ExtensionToWebviewMessage);
        };
        window.addEventListener('message', onMessage);

        const saved = getVsCodeApi().getState() as { activeTab?: Tab } | undefined;
        if (saved?.activeTab) {
            this.tab.activeTab = saved.activeTab;
        }

        requestAnimationFrame(() => {
            postToExtension({ type: 'ready' });
            if (this.tab.activeTab === 'graph') {
                this.requestGraph();
            }
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
        };
    }
}

export const app = new AppState();

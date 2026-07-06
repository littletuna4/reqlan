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
import { GraphLoadController, type GraphLoadUiPhase } from '../lib/graph-load-controller.js';
import { indexStatusText } from '../lib/index-status-text.js';
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
        loadPhase: 'idle' as GraphLoadUiPhase,
        loadDetail: ''
    });

    dump = $state({
        output: '',
        visible: false
    });

    private extensionConnected = false;
    private extensionConnectTimer: ReturnType<typeof setTimeout> | undefined;
    private ideasSearchDebounce = createDebounced((query: IdeasTableQuery) => this.loadIdeas(query), 250);
    private ideasetsSearchDebounce = createDebounced((query: IdeasetsTableQuery) => this.loadIdeasets(query), 250);
    private referencesSearchDebounce = createDebounced((query: ReferencesTableQuery) => this.loadReferences(query), 250);
    private graphController = new GraphLoadController(
        {
            onStateChange: (state) => {
                this.graph.query = state.query;
                this.graph.slice = state.slice;
                this.graph.loading = state.loading;
                this.graph.loadPhase = state.phase;
                this.graph.loadDetail = state.detail;
            },
            onTimeout: (message) => this.setStatus(message, true)
        },
        {
            query: defaultGraphQuery(),
            slice: undefined,
            loading: false,
            phase: 'idle',
            detail: ''
        }
    );

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

    requestGraph(): void {
        const state = this.graphController.getState();
        if (state.loading) {
            return;
        }
        if (!state.slice || state.slice.waitingForIndex || state.phase === 'failed') {
            this.loadGraph(state.query);
        }
    }

    private onIndexStatusForGraph(status: IndexStatusView): void {
        if (this.tab.activeTab !== 'graph') {
            return;
        }
        const state = this.graphController.getState();
        if (state.loading) {
            return;
        }
        if (!state.slice || state.slice.waitingForIndex || state.phase === 'failed') {
            this.loadGraph(state.query);
        }
    }

    loadGraph(query: GraphViewQuery): void {
        const requestId = this.graphController.load(query);
        postToExtension({ type: 'loadGraph', query, requestId });
    }

    onGraphRendered(): void {
        this.graphController.onRendered();
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
            case 'indexStatus':
                this.index.status = message.status;
                {
                    const { text, error } = indexStatusText(message.status);
                    this.setStatus(text, error);
                }
                this.onIndexStatusForGraph(message.status);
                break;
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
            case 'graphLoadProgress':
                this.graphController.applyProgress(
                    message.progress.phase,
                    message.progress.detail,
                    message.progress.requestId
                );
                break;
            case 'graphSlice':
                this.graphController.applySlice(message.slice, message.requestId);
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
            case 'error': {
                const handled = this.graphController.applyError(message.message, message.requestId);
                if (!handled) {
                    break;
                }
                this.setStatus(message.message, true);
                break;
            }
        }
    }

    init(): () => void {
        const saved = getVsCodeApi().getState() as { activeTab?: Tab } | undefined;
        if (saved?.activeTab) {
            this.tab.activeTab = saved.activeTab;
        }

        const onMessage = (event: MessageEvent): void => {
            this.handleExtensionMessage(event.data as ExtensionToWebviewMessage);
        };
        window.addEventListener('message', onMessage);

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
            this.ideasSearchDebounce.cancel();
            this.ideasetsSearchDebounce.cancel();
            this.referencesSearchDebounce.cancel();
            this.graphController.dispose();
        };
    }
}

export const app = new AppState();

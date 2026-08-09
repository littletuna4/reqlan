import type {
    ActivityBarErrorScope,
    ExtensionToActivityBarMessage
} from '../../../src/activity_bar_module/activity-bar-messages.js';
import type {
    ActivityBarScope,
    AncestorChainResult,
    ContextDimensionId,
    ContextFileLensDetail,
    IdeaSummary,
    ReqlanContextModel
} from '@reqlan/analytical';
import type { GraphViewQuery, GraphViewSlice, IndexStatusView } from '../../../src/webview_module/shared/messages.js';
import type { PhonebookLinkView, ReferenceListsPayload, IdeaSearchHitView, IdeaSearchProgressPayload, IdeaSearchResultsPayload, TodoIdeaHitView, TodoListPayload } from '../../../src/activity_bar_module/activity-bar-messages.js';
import { buildReferencesPayloadFromCurrentFile, groupReferences } from '../../../src/activity_bar_module/context-helpers.js';
import { getVsCodeApi, postToExtension } from '../lib/vscode.js';
import { indexStatusText } from '../../ideas-summary/lib/index-status-text.js';

/** High-level content sequencing for the pane stack below the header. */
export type ActivityBarContentPhase =
    | 'connecting'
    | 'waiting_index'
    | 'bootstrapping'
    | 'ready'
    | 'error';

const HOST_CONNECT_TIMEOUT_MS = 15_000;
const IDEA_SEARCH_DEBOUNCE_MS = 200;

export class AppState {
    syncWithEditor = $state(true);
    globalHopDepth = $state(1);
    minHopDepth = $state(1);
    maxHopDepth = $state(4);
    pinnedFocusId = $state<string | undefined>(undefined);

    /** True after any message from the extension host. */
    hostConnected = $state(false);
    /** True after host finishes the ready handshake (index + editor refresh). */
    bootstrapComplete = $state(false);
    bootstrapError = $state<string | undefined>(undefined);

    scope = $state<ActivityBarScope | undefined>(undefined);
    context = $state<ReqlanContextModel | undefined>(undefined);
    contextError = $state<string | undefined>(undefined);
    fileLensDetails = $state<Record<string, ContextFileLensDetail>>({});
    private contextRevision = 0;
    references = $state<ReferenceListsPayload | undefined>(undefined);
    referencesLoading = $state(false);
    referencesError = $state<string | undefined>(undefined);
    referenceSearch = $state('');
    brokenOnly = $state(false);
    graph = $state({
        query: { includeIndirect: false, hopDepth: 1, maxNodes: 40 } as GraphViewQuery,
        slice: undefined as GraphViewSlice | undefined,
        loading: false,
        error: undefined as string | undefined,
        rendering: false
    });
    ancestors = $state<AncestorChainResult | undefined>(undefined);
    ancestorsLoading = $state(false);
    ancestorsError = $state<string | undefined>(undefined);
    ideaSearchQuery = $state('');
    ideaSearchResults = $state<IdeaSearchHitView[]>([]);
    ideaSearchTotal = $state(0);
    ideaSearchTruncated = $state(false);
    ideaSearchLoading = $state(false);
    ideaSearchProgress = $state<IdeaSearchProgressPayload | undefined>(undefined);
    /** Seconds since the current search wait began; ticks while loading for liveness. */
    ideaSearchElapsedSec = $state(0);
    ideaSearchError = $state<string | undefined>(undefined);
    todoResults = $state<TodoIdeaHitView[]>([]);
    todoTotal = $state(0);
    todoTruncated = $state(false);
    todoLoading = $state(false);
    todoError = $state<string | undefined>(undefined);
    todoLoaded = $state(false);
    indexStatus = $state<IndexStatusView | undefined>(undefined);
    /** Base id the user requested; cleared when indexHealth confirms activeBaseId. */
    pendingBaseId = $state<string | undefined>(undefined);
    tray = $state<IdeaSummary[]>([]);
    siteLink = $state<PhonebookLinkView | undefined>(undefined);
    statusText = $state('Connecting…');
    statusError = $state(false);

    private requestCounter = 0;
    private referencesRequestId = 0;
    private ideaSearchRequestId = 0;
    private ideaSearchTimer: ReturnType<typeof setTimeout> | undefined;
    private ideaSearchElapsedTimer: ReturnType<typeof setInterval> | undefined;
    private ideaSearchStartedAt = 0;
    private todoRequestId = 0;
    private lastTodoFingerprint: string | undefined;
    private hostTimeout: ReturnType<typeof setTimeout> | undefined;
    private pendingByRequestId = new Map<number, ActivityBarErrorScope>();

    get contentPhase(): ActivityBarContentPhase {
        if (this.bootstrapError) {
            return 'error';
        }
        if (!this.hostConnected) {
            return 'connecting';
        }
        if (!this.indexStatus) {
            return 'waiting_index';
        }
        if (!this.indexStatus.ready) {
            if (this.indexStatus.state === 'error') {
                return 'error';
            }
            return 'waiting_index';
        }
        if (!this.bootstrapComplete) {
            return 'bootstrapping';
        }
        return 'ready';
    }

    get indexProgressLabel(): string | undefined {
        const progress = this.indexStatus?.syncProgress;
        if (!progress || progress.total <= 0) {
            return undefined;
        }
        const pct = Math.round((progress.processed / progress.total) * 100);
        const file = progress.currentFile ? ` · ${progress.currentFile}` : '';
        return `${progress.processed} / ${progress.total} files (${pct}%)${file}`;
    }

    init(): () => void {
        const onMessage = (event: MessageEvent): void => {
            this.handleMessage(event.data as ExtensionToActivityBarMessage);
        };
        window.addEventListener('message', onMessage);
        this.beginHostWait();
        return () => {
            window.removeEventListener('message', onMessage);
            this.clearHostTimeout();
            this.clearIdeaSearchTimer();
        };
    }

    signalFirstPaint(): void {
        postToExtension({ type: 'ready' });
    }

    retryBootstrap(): void {
        this.bootstrapError = undefined;
        this.bootstrapComplete = false;
        this.statusText = 'Connecting…';
        this.statusError = false;
        this.beginHostWait();
        postToExtension({ type: 'ready' });
    }

    private beginHostWait(): void {
        this.clearHostTimeout();
        this.hostTimeout = setTimeout(() => {
            if (!this.hostConnected) {
                this.bootstrapError = 'Timed out waiting for the extension host.';
                this.statusText = this.bootstrapError;
                this.statusError = true;
            }
        }, HOST_CONNECT_TIMEOUT_MS);
    }

    private clearHostTimeout(): void {
        if (this.hostTimeout !== undefined) {
            clearTimeout(this.hostTimeout);
            this.hostTimeout = undefined;
        }
    }

    private markHostConnected(): void {
        if (!this.hostConnected) {
            this.hostConnected = true;
            this.clearHostTimeout();
            if (this.statusText === 'Connecting…') {
                this.statusText = 'Waiting for index…';
            }
        }
    }

    private nextRequestId(scope?: ActivityBarErrorScope): number {
        const id = ++this.requestCounter;
        if (scope) {
            this.pendingByRequestId.set(id, scope);
        }
        return id;
    }

    private clearPending(requestId?: number): ActivityBarErrorScope | undefined {
        if (requestId === undefined) {
            return undefined;
        }
        const scope = this.pendingByRequestId.get(requestId);
        this.pendingByRequestId.delete(requestId);
        return scope;
    }

    handleMessage(message: ExtensionToActivityBarMessage): void {
        this.markHostConnected();
        switch (message.type) {
            case 'editorContext':
                this.syncWithEditor = message.syncWithEditor;
                this.globalHopDepth = message.globalHopDepth;
                this.minHopDepth = message.minHopDepth;
                this.maxHopDepth = message.maxHopDepth;
                this.pinnedFocusId = message.pinnedFocusId;
                this.graph.query.hopDepth = message.globalHopDepth;
                this.graph.query.includeIndirect = message.globalHopDepth >= 2;
                break;
            case 'context':
                this.contextError = undefined;
                if (message.model.revision >= this.contextRevision) {
                    this.contextRevision = message.model.revision;
                    this.context = message.model;
                    this.scope = message.model.currentFile;
                    this.globalHopDepth = message.model.globalHopDepth;
                    this.minHopDepth = message.model.minHopDepth;
                    this.maxHopDepth = message.model.maxHopDepth;
                    this.graph.query.hopDepth = message.model.globalHopDepth;
                    this.graph.query.includeIndirect = message.model.globalHopDepth >= 2;
                    const centerId = message.model.footprint.effectiveCenterId;
                    if (message.model.references) {
                        this.referencesLoading = false;
                        this.referencesError = undefined;
                        this.references = {
                            ideaId: message.model.references.ideaId,
                            rows: message.model.references.rows,
                            grouped: groupReferences(message.model.references.rows)
                        };
                    } else if (centerId && message.model.currentFile) {
                        this.referencesLoading = false;
                        this.referencesError = undefined;
                        this.references = buildReferencesPayloadFromCurrentFile(
                            centerId,
                            message.model.currentFile
                        );
                    }
                    if (centerId) {
                        if (this.referenceSearch || this.brokenOnly) {
                            this.loadReferences(centerId);
                        }
                        this.loadGraph(centerId);
                        this.loadAncestors(centerId);
                    } else {
                        this.references = undefined;
                        this.ancestors = undefined;
                        this.graph.slice = undefined;
                        this.graph.loading = false;
                        this.graph.error = undefined;
                    }
                }
                break;
            case 'scope':
                if (!this.context || this.context.revision === this.contextRevision) {
                    this.scope = message.scope;
                }
                if (message.scope?.focusIdea?.id && !this.context) {
                    const focusId = message.scope.focusIdea.id;
                    this.loadReferences(focusId);
                    this.loadGraph(focusId);
                    this.loadAncestors(focusId);
                }
                break;
            case 'references':
                if (
                    message.requestId !== undefined &&
                    message.requestId < this.referencesRequestId
                ) {
                    break;
                }
                if (message.requestId !== undefined) {
                    this.referencesRequestId = message.requestId;
                }
                this.clearPending(message.requestId);
                if (
                    message.payload.rows.length === 0 &&
                    this.references?.ideaId === message.payload.ideaId &&
                    (this.references.rows.length ?? 0) > 0 &&
                    !this.referenceSearch &&
                    !this.brokenOnly
                ) {
                    this.referencesLoading = false;
                    this.referencesError = undefined;
                    break;
                }
                this.references = message.payload;
                this.referencesLoading = false;
                this.referencesError = undefined;
                break;
            case 'graphSlice':
                this.clearPending(message.requestId);
                this.graph.slice = message.slice;
                this.graph.query = message.slice.query;
                this.graph.loading = false;
                this.graph.error = undefined;
                this.graph.rendering = true;
                break;
            case 'ancestors':
                this.clearPending(message.requestId);
                this.ancestors = message.result;
                this.ancestorsLoading = false;
                this.ancestorsError = undefined;
                break;
            case 'ideaSearchResults':
                if (
                    message.requestId !== undefined &&
                    message.requestId < this.ideaSearchRequestId
                ) {
                    break;
                }
                this.clearPending(message.requestId);
                this.applyIdeaSearchResults(message.payload);
                break;
            case 'ideaSearchProgress':
                if (
                    message.requestId !== undefined &&
                    message.requestId < this.ideaSearchRequestId
                ) {
                    break;
                }
                this.ideaSearchProgress = message.payload;
                this.ideaSearchLoading = true;
                this.ideaSearchError = undefined;
                this.ensureIdeaSearchElapsedTimer();
                break;
            case 'todoList':
                if (
                    message.requestId !== undefined &&
                    message.requestId < this.todoRequestId
                ) {
                    break;
                }
                this.clearPending(message.requestId);
                this.applyTodoList(message.payload);
                break;
            case 'indexHealth':
                this.indexStatus = message.status;
                if (
                    this.pendingBaseId !== undefined &&
                    message.status.activeBaseId === this.pendingBaseId
                ) {
                    this.pendingBaseId = undefined;
                }
                if (message.status.ready) {
                    const { text, error } = indexStatusText(message.status);
                    this.statusText = text;
                    this.statusError = error;
                    this.bootstrapError = undefined;
                    const fingerprint = `${message.status.activeBaseId ?? ''}:${message.status.ideaCount}`;
                    if (fingerprint !== this.lastTodoFingerprint) {
                        this.loadTodos();
                    }
                } else if (message.status.state === 'error' && message.status.lastError?.summary) {
                    const { text, error } = indexStatusText(message.status);
                    this.statusText = text;
                    this.statusError = error;
                    this.bootstrapError = message.status.lastError.summary;
                } else if (message.status.lastError?.summary) {
                    const { text, error } = indexStatusText(message.status);
                    this.statusText = text;
                    this.statusError = error;
                } else if (message.status.syncProgress) {
                    this.statusText = this.indexProgressLabel ?? `Index: ${message.status.state}`;
                    this.statusError = false;
                } else {
                    this.statusText = `Index: ${message.status.state}`;
                    this.statusError = false;
                }
                break;
            case 'tray':
                this.tray = message.tray.pinned;
                break;
            case 'scopeMarkdown':
            case 'contextMarkdown':
            case 'trayMarkdown':
                void navigator.clipboard.writeText(message.text);
                break;
            case 'fileLensDetail':
                this.fileLensDetails = {
                    ...this.fileLensDetails,
                    [message.detail.fileUri]: message.detail
                };
                break;
            case 'phonebookLinks':
                this.siteLink = message.links.find(link => link.id === 'site') ?? message.links[0];
                break;
            case 'bootstrapComplete':
                this.bootstrapComplete = true;
                this.bootstrapError = undefined;
                if (!this.indexStatus?.ready && this.statusText === 'Waiting for index…') {
                    // Keep waiting label; indexHealth will update.
                } else if (this.indexStatus?.ready && !this.statusError) {
                    // statusText already set from indexHealth
                }
                break;
            case 'error': {
                const pendingScope = this.clearPending(message.requestId);
                const scope = message.scope ?? pendingScope ?? 'bootstrap';
                this.applyScopedError(scope, message.message);
                break;
            }
        }
    }

    private applyScopedError(scope: ActivityBarErrorScope, message: string): void {
        switch (scope) {
            case 'graph':
                this.graph.loading = false;
                this.graph.error = message;
                break;
            case 'references':
                this.referencesLoading = false;
                this.referencesError = message;
                break;
            case 'ancestors':
                this.ancestorsLoading = false;
                this.ancestorsError = message;
                break;
            case 'search':
                this.ideaSearchLoading = false;
                this.ideaSearchProgress = undefined;
                this.clearIdeaSearchElapsedTimer();
                this.ideaSearchError = message;
                break;
            case 'todos':
                this.todoLoading = false;
                this.todoError = message;
                break;
            case 'context':
                this.contextError = message;
                this.statusText = message;
                this.statusError = true;
                break;
            case 'index':
                this.pendingBaseId = undefined;
                this.statusText = message;
                this.statusError = true;
                if (!this.indexStatus?.ready) {
                    this.bootstrapError = message;
                }
                break;
            case 'bootstrap':
            default:
                if (this.graph.loading) {
                    this.graph.loading = false;
                    this.graph.error = message;
                }
                this.statusText = message;
                this.statusError = true;
                if (!this.bootstrapComplete && !this.indexStatus?.ready) {
                    this.bootstrapError = message;
                }
                break;
        }
    }

    setSyncWithEditor(enabled: boolean): void {
        this.syncWithEditor = enabled;
        postToExtension({ type: 'setSyncWithEditor', enabled });
    }

    adjustGlobalHopDepth(delta: number): void {
        postToExtension({ type: 'adjustGlobalHopDepth', delta });
    }

    adjustDimensionHopDepth(dimension: ContextDimensionId, delta: number): void {
        postToExtension({ type: 'adjustDimensionHopDepth', dimension, delta });
    }

    effectiveDimensionHop(dimension: ContextDimensionId): number {
        return this.context?.dimensions.find(dim => dim.id === dimension)?.hopDepth ?? this.globalHopDepth;
    }

    focusIdea(ideaId: string): void {
        this.pinnedFocusId = ideaId;
        postToExtension({ type: 'setPinnedFocus', ideaId });
    }

    openIdea(fileUri: string, line: number, column = 0): void {
        // Drop pending/in-flight search work so the host can open immediately.
        this.clearIdeaSearchTimer();
        this.clearPending(this.ideaSearchRequestId);
        this.ideaSearchRequestId = ++this.requestCounter;
        this.ideaSearchLoading = false;
        this.ideaSearchProgress = undefined;
        this.clearIdeaSearchElapsedTimer();
        postToExtension({ type: 'openIdea', fileUri, line, column });
    }

    createStubIdea(sourceIdeaId: string, refText: string): void {
        postToExtension({ type: 'createStubIdea', sourceIdeaId, refText });
    }

    loadReferences(ideaId: string): void {
        const requestId = this.nextRequestId('references');
        this.referencesRequestId = requestId;
        this.referencesLoading = true;
        this.referencesError = undefined;
        postToExtension({
            type: 'loadReferences',
            ideaId,
            search: this.referenceSearch || undefined,
            brokenOnly: this.brokenOnly || undefined,
            requestId
        });
    }

    loadGraph(centerId: string): void {
        this.graph.loading = true;
        this.graph.error = undefined;
        const hopDepth = this.context?.globalHopDepth ?? this.globalHopDepth;
        postToExtension({
            type: 'loadGraph',
            query: {
                centerId,
                includeIndirect: hopDepth >= 2,
                hopDepth,
                maxNodes: 40
            },
            requestId: this.nextRequestId('graph')
        });
    }

    loadAncestors(ideaId: string): void {
        const requestId = this.nextRequestId('ancestors');
        this.ancestorsLoading = true;
        this.ancestorsError = undefined;
        postToExtension({ type: 'loadAncestors', ideaId, requestId });
    }

    onIdeaSearchInput(query: string): void {
        this.ideaSearchQuery = query;
        this.clearIdeaSearchTimer();
        const trimmed = query.trim();
        if (!trimmed) {
            this.ideaSearchResults = [];
            this.ideaSearchTotal = 0;
            this.ideaSearchTruncated = false;
            this.ideaSearchLoading = false;
            this.ideaSearchProgress = undefined;
            this.clearIdeaSearchElapsedTimer();
            this.ideaSearchError = undefined;
            return;
        }
        // Debounce before flipping loading — keep current hits clickable while typing.
        this.ideaSearchTimer = setTimeout(() => {
            this.ideaSearchTimer = undefined;
            this.searchIdeas(trimmed);
        }, IDEA_SEARCH_DEBOUNCE_MS);
    }

    searchIdeas(query: string): void {
        const requestId = this.nextRequestId('search');
        this.ideaSearchRequestId = requestId;
        this.ideaSearchLoading = true;
        this.ideaSearchProgress = {
            phase: 'catalog',
            message: 'Starting search…'
        };
        this.ideaSearchError = undefined;
        this.startIdeaSearchElapsedTimer();
        postToExtension({ type: 'searchIdeas', query, requestId });
    }

    loadTodos(): void {
        if (!this.indexStatus?.ready) {
            return;
        }
        const requestId = this.nextRequestId('todos');
        this.todoRequestId = requestId;
        this.todoLoading = true;
        this.todoError = undefined;
        this.lastTodoFingerprint = `${this.indexStatus.activeBaseId ?? ''}:${this.indexStatus.ideaCount}`;
        postToExtension({ type: 'loadTodos', requestId });
    }

    insertReference(hit: IdeaSearchHitView): void {
        postToExtension({
            type: 'insertReference',
            fileUri: hit.fileUri,
            name: hit.name,
            kind: hit.kind
        });
    }

    addToChat(hit: IdeaSearchHitView): void {
        postToExtension({
            type: 'addToChat',
            name: hit.name,
            path: hit.path,
            summary: hit.summary,
            lineStart: hit.lineStart
        });
    }

    private applyIdeaSearchResults(payload: IdeaSearchResultsPayload): void {
        // Keep the draft query as source of truth — do not clobber mid-typing input.
        this.ideaSearchResults = payload.results;
        this.ideaSearchTotal = payload.total;
        this.ideaSearchTruncated = payload.truncated;
        this.ideaSearchLoading = false;
        this.ideaSearchProgress = undefined;
        this.clearIdeaSearchElapsedTimer();
        this.ideaSearchError = undefined;
    }

    private applyTodoList(payload: TodoListPayload): void {
        this.todoResults = payload.results;
        this.todoTotal = payload.total;
        this.todoTruncated = payload.truncated;
        this.todoLoading = false;
        this.todoError = undefined;
        this.todoLoaded = true;
    }

    private clearIdeaSearchTimer(): void {
        if (this.ideaSearchTimer !== undefined) {
            clearTimeout(this.ideaSearchTimer);
            this.ideaSearchTimer = undefined;
        }
    }

    private startIdeaSearchElapsedTimer(): void {
        this.clearIdeaSearchElapsedTimer();
        this.ideaSearchStartedAt = Date.now();
        this.ideaSearchElapsedSec = 0;
        this.ideaSearchElapsedTimer = setInterval(() => {
            this.ideaSearchElapsedSec = Math.floor((Date.now() - this.ideaSearchStartedAt) / 1000);
        }, 250);
    }

    private ensureIdeaSearchElapsedTimer(): void {
        if (this.ideaSearchElapsedTimer !== undefined) {
            return;
        }
        this.startIdeaSearchElapsedTimer();
    }

    private clearIdeaSearchElapsedTimer(): void {
        if (this.ideaSearchElapsedTimer !== undefined) {
            clearInterval(this.ideaSearchElapsedTimer);
            this.ideaSearchElapsedTimer = undefined;
        }
        this.ideaSearchElapsedSec = 0;
        this.ideaSearchStartedAt = 0;
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

    createBase(): void {
        postToExtension({ type: 'createBase' });
    }

    selectBase(baseId: string): void {
        if (baseId === this.indexStatus?.activeBaseId && this.pendingBaseId === undefined) {
            return;
        }
        this.pendingBaseId = baseId;
        this.statusText = 'Switching base…';
        this.statusError = false;
        postToExtension({ type: 'selectBase', baseId });
    }

    get displayedBaseId(): string | undefined {
        return this.pendingBaseId ?? this.indexStatus?.activeBaseId;
    }

    get baseSwitchPending(): boolean {
        return this.pendingBaseId !== undefined;
    }

    pinIdea(ideaId: string): void {
        postToExtension({ type: 'pinIdea', ideaId });
    }

    unpinIdea(ideaId: string): void {
        postToExtension({ type: 'unpinIdea', ideaId });
    }

    clearTray(): void {
        postToExtension({ type: 'clearTray' });
    }

    copyTrayMarkdown(): void {
        postToExtension({ type: 'copyTrayMarkdown' });
    }

    copyScopeMarkdown(ideaId: string): void {
        postToExtension({ type: 'copyScopeMarkdown', ideaId });
    }

    copyContextMarkdown(): void {
        postToExtension({ type: 'copyContextMarkdown' });
    }

    async loadFileLens(fileUri: string): Promise<void> {
        postToExtension({ type: 'loadFileLens', fileUri, requestId: this.nextRequestId('context') });
    }

    openIdeasSummary(tab: 'ideas' | 'graph' | 'index'): void {
        const focus = this.scope?.focusIdea;
        postToExtension({
            type: 'openIdeasSummary',
            intent: {
                activeTab: tab,
                centerId: focus?.id,
                pathFilter: this.scope?.fileLabel,
                includeIndirect: this.globalHopDepth >= 2
            }
        });
    }

    /** Open Ideas Summary ideas table, prefilling the advanced search with the pane query. */
    openAdvancedIdeaSearch(): void {
        const search = this.ideaSearchQuery.trim();
        postToExtension({
            type: 'openIdeasSummary',
            intent: {
                activeTab: 'ideas',
                pathFilter: search || undefined
            }
        });
    }

    onGraphRendered(): void {
        this.graph.rendering = false;
    }

    onReferencesFilterChange(): void {
        const centerId = this.context?.footprint.effectiveCenterId ?? this.scope?.focusIdea?.id;
        if (centerId) {
            this.loadReferences(centerId);
        }
    }

    toggleContextDimension(dimension: ContextDimensionId, enabled: boolean): void {
        postToExtension({ type: 'toggleContextDimension', dimension, enabled });
    }

    setExpandedLens(dimension?: ContextDimensionId): void {
        postToExtension({ type: 'setExpandedLens', dimension });
    }

    openSiteLink(): void {
        postToExtension({ type: 'openPhonebookLink', linkId: 'site' });
    }

    persistViewState(state: {
        panes: Record<string, boolean>;
        heights: Record<string, number>;
    }): void {
        getVsCodeApi().setState({
            panes: state.panes,
            heights: state.heights
        });
    }

    restoreViewState(): {
        panes: Record<string, boolean>;
        heights: Record<string, number>;
    } {
        const saved = getVsCodeApi().getState() as {
            panes?: Record<string, boolean>;
            heights?: Record<string, number>;
        } | undefined;
        return {
            panes: saved?.panes ?? {},
            heights: saved?.heights ?? {}
        };
    }

    /** @deprecated Prefer persistViewState — kept for older webview bundles. */
    persistPaneState(state: Record<string, boolean>): void {
        const heights = this.restoreViewState().heights;
        this.persistViewState({ panes: state, heights });
    }

    /** @deprecated Prefer restoreViewState — kept for older webview bundles. */
    restorePaneState(): Record<string, boolean> {
        return this.restoreViewState().panes;
    }
}

export const app = new AppState();

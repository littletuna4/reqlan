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
import type { PhonebookLinkView, ReferenceListsPayload } from '../../../src/activity_bar_module/activity-bar-messages.js';
import { buildReferencesPayloadFromCurrentFile, groupReferences } from '../../../src/activity_bar_module/context-helpers.js';
import { getVsCodeApi, postToExtension } from '../lib/vscode.js';

/** High-level content sequencing for the pane stack below the header. */
export type ActivityBarContentPhase =
    | 'connecting'
    | 'waiting_index'
    | 'bootstrapping'
    | 'ready'
    | 'error';

const HOST_CONNECT_TIMEOUT_MS = 15_000;

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
    indexStatus = $state<IndexStatusView | undefined>(undefined);
    tray = $state<IdeaSummary[]>([]);
    siteLink = $state<PhonebookLinkView | undefined>(undefined);
    statusText = $state('Connecting…');
    statusError = $state(false);

    private requestCounter = 0;
    private referencesRequestId = 0;
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
        return `${progress.processed} / ${progress.total} files (${pct}%)`;
    }

    init(): () => void {
        const onMessage = (event: MessageEvent): void => {
            this.handleMessage(event.data as ExtensionToActivityBarMessage);
        };
        window.addEventListener('message', onMessage);
        this.beginHostWait();
        postToExtension({ type: 'ready' });
        return () => {
            window.removeEventListener('message', onMessage);
            this.clearHostTimeout();
        };
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
            case 'indexHealth':
                this.indexStatus = message.status;
                if (message.status.ready) {
                    const issueHint = message.status.fileIssueCount > 0
                        ? ` · ${message.status.fileIssueCount} issue(s)`
                        : '';
                    this.statusText = `${message.status.ideaCount} ideas indexed${issueHint}`;
                    this.statusError = message.status.fileIssueCount > 0 || Boolean(message.status.lastError);
                    this.bootstrapError = undefined;
                } else if (message.status.state === 'error' && message.status.lastError?.summary) {
                    this.statusText = message.status.lastError.summary;
                    this.statusError = true;
                    this.bootstrapError = message.status.lastError.summary;
                } else if (message.status.lastError?.summary) {
                    this.statusText = message.status.lastError.summary;
                    this.statusError = true;
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
            case 'context':
                this.contextError = message;
                this.statusText = message;
                this.statusError = true;
                break;
            case 'index':
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

    refreshIndex(): void {
        postToExtension({ type: 'refreshIndex' });
    }

    clearAndRebuildIndex(): void {
        postToExtension({ type: 'clearAndRebuildIndex' });
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

    persistPaneState(state: Record<string, boolean>): void {
        getVsCodeApi().setState({ panes: state });
    }

    restorePaneState(): Record<string, boolean> {
        const saved = getVsCodeApi().getState() as { panes?: Record<string, boolean> } | undefined;
        return saved?.panes ?? {};
    }
}

export const app = new AppState();

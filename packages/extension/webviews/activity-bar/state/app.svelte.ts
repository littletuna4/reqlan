import type {
    ActivityBarToExtensionMessage,
    ExtensionToActivityBarMessage
} from '../../../src/activity_bar_module/activity-bar-messages.js';
import type {
    ActivityBarScope,
    AncestorChainResult,
    ContextDimensionId,
    ContextFileLensDetail,
    IdeaSummary,
    ReqlanContextModel
} from 'reqlan-analytical';
import type { GraphViewQuery, GraphViewSlice, IndexStatusView } from '../../../src/webview_module/shared/messages.js';
import type { PhonebookLinkView, ReferenceListsPayload } from '../../../src/activity_bar_module/activity-bar-messages.js';
import { buildReferencesPayloadFromCurrentFile, groupReferences } from '../../../src/activity_bar_module/context-helpers.js';
import { getVsCodeApi, postToExtension } from '../lib/vscode.js';

export class AppState {
    syncWithEditor = $state(true);
    includeIndirect = $state(false);
    pinnedFocusId = $state<string | undefined>(undefined);

    scope = $state<ActivityBarScope | undefined>(undefined);
    context = $state<ReqlanContextModel | undefined>(undefined);
    fileLensDetails = $state<Record<string, ContextFileLensDetail>>({});
    private contextRevision = 0;
    references = $state<ReferenceListsPayload | undefined>(undefined);
    referenceSearch = $state('');
    brokenOnly = $state(false);
    graph = $state({
        query: { includeIndirect: false, maxNodes: 40 } as GraphViewQuery,
        slice: undefined as GraphViewSlice | undefined,
        loading: false,
        error: undefined as string | undefined,
        rendering: false
    });
    ancestors = $state<AncestorChainResult | undefined>(undefined);
    indexStatus = $state<IndexStatusView | undefined>(undefined);
    tray = $state<IdeaSummary[]>([]);
    siteLink = $state<PhonebookLinkView | undefined>(undefined);
    statusText = $state('Loading…');
    statusError = $state(false);

    private requestCounter = 0;
    private referencesRequestId = 0;

    init(): () => void {
        const onMessage = (event: MessageEvent): void => {
            this.handleMessage(event.data as ExtensionToActivityBarMessage);
        };
        window.addEventListener('message', onMessage);
        postToExtension({ type: 'ready' });
        return () => window.removeEventListener('message', onMessage);
    }

    private nextRequestId(): number {
        return ++this.requestCounter;
    }

    handleMessage(message: ExtensionToActivityBarMessage): void {
        switch (message.type) {
            case 'editorContext':
                this.syncWithEditor = message.syncWithEditor;
                this.includeIndirect = message.includeIndirect;
                this.pinnedFocusId = message.pinnedFocusId;
                this.graph.query.includeIndirect = message.includeIndirect;
                break;
            case 'context':
                if (message.model.revision >= this.contextRevision) {
                    this.contextRevision = message.model.revision;
                    this.context = message.model;
                    this.scope = message.model.currentFile;
                    const centerId = message.model.footprint.effectiveCenterId;
                    if (message.model.references) {
                        this.references = {
                            ideaId: message.model.references.ideaId,
                            rows: message.model.references.rows,
                            grouped: groupReferences(message.model.references.rows)
                        };
                    } else if (centerId && message.model.currentFile) {
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
                if (
                    message.payload.rows.length === 0 &&
                    this.references?.ideaId === message.payload.ideaId &&
                    (this.references.rows.length ?? 0) > 0 &&
                    !this.referenceSearch &&
                    !this.brokenOnly
                ) {
                    break;
                }
                this.references = message.payload;
                break;
            case 'graphSlice':
                this.graph.slice = message.slice;
                this.graph.query = message.slice.query;
                this.graph.loading = false;
                this.graph.error = undefined;
                this.graph.rendering = true;
                break;
            case 'ancestors':
                this.ancestors = message.result;
                break;
            case 'indexHealth':
                this.indexStatus = message.status;
                if (message.status.ready) {
                    const issueHint = message.status.fileIssueCount > 0
                        ? ` · ${message.status.fileIssueCount} issue(s)`
                        : '';
                    this.statusText = `${message.status.ideaCount} ideas indexed${issueHint}`;
                    this.statusError = message.status.fileIssueCount > 0 || Boolean(message.status.lastError);
                } else if (message.status.lastError?.summary) {
                    this.statusText = message.status.lastError.summary;
                    this.statusError = true;
                } else {
                    this.statusText = `Index: ${message.status.state}`;
                    this.statusError = message.status.state === 'error';
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
            case 'error':
                if (this.graph.loading) {
                    this.graph.loading = false;
                    this.graph.error = message.message;
                }
                this.statusText = message.message;
                this.statusError = true;
                break;
        }
    }

    setSyncWithEditor(enabled: boolean): void {
        this.syncWithEditor = enabled;
        postToExtension({ type: 'setSyncWithEditor', enabled });
    }

    setIncludeIndirect(enabled: boolean): void {
        this.includeIndirect = enabled;
        this.graph.query = { ...this.graph.query, includeIndirect: enabled };
        postToExtension({ type: 'setIncludeIndirect', enabled });
        const centerId = this.context?.footprint.effectiveCenterId ?? this.scope?.focusIdea?.id;
        if (centerId) {
            this.loadGraph(centerId);
        }
    }

    focusIdea(ideaId: string): void {
        this.pinnedFocusId = ideaId;
        postToExtension({ type: 'setPinnedFocus', ideaId });
    }

    openIdea(fileUri: string, line: number, column = 0): void {
        postToExtension({ type: 'openIdea', fileUri, line, column });
    }

    loadReferences(ideaId: string): void {
        const requestId = this.nextRequestId();
        this.referencesRequestId = requestId;
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
        postToExtension({
            type: 'loadGraph',
            query: {
                centerId,
                includeIndirect: this.includeIndirect,
                maxNodes: 40
            },
            requestId: this.nextRequestId()
        });
    }

    loadAncestors(ideaId: string): void {
        postToExtension({ type: 'loadAncestors', ideaId, requestId: this.nextRequestId() });
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
        postToExtension({ type: 'loadFileLens', fileUri, requestId: this.nextRequestId() });
    }

    openIdeasSummary(tab: 'ideas' | 'graph' | 'index'): void {
        const focus = this.scope?.focusIdea;
        postToExtension({
            type: 'openIdeasSummary',
            intent: {
                activeTab: tab,
                centerId: focus?.id,
                pathFilter: this.scope?.fileLabel,
                includeIndirect: this.includeIndirect
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

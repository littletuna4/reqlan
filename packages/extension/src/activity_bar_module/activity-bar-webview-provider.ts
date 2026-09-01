import * as vscode from 'vscode';
import {
    CONTEXT_MAX_HOP_DEPTH,
    CONTEXT_MIN_HOP_DEPTH
} from '@reqlan/analytical';
import { REQLAN_IMPORT_ERROR_CREATE_COMMAND } from '@reqlan/language';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { openIndexFile } from '../analytical_submodule/index-store/open-index-file.js';
import { toIndexFileUri, resolveIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import { toIndexStatusView } from '../webview_module/ideas-summary-panel.js';
import { IdeasSummaryPanel } from '../webview_module/ideas-summary-panel.js';
import { getPhonebookLink, type PhonebookLinkId } from '../shared/phonebook.js';
import { ActivityBarDataService, formatIdeaMarkdown } from './activity-bar-data-service.js';
import { collectGitContext, gitChangeForFile } from './git-context.js';
import {
    createContextSession,
    pinManualIdea,
    recordFileEdit,
    recordFileVisit,
    setDimensionEnabled,
    setExpandedLens,
    unpinManualIdea,
    clearManualIdeas,
    adjustGlobalHopDepth,
    adjustDimensionHopDepth,
    effectiveHopDepth,
    type ContextSessionState
} from './context-session.js';
import { getActivityBarHtml } from './get-activity-bar-html.js';
import type {
    ActivityBarToExtensionMessage,
    ExtensionToActivityBarMessage,
    IdeasSummaryIntent
} from './activity-bar-messages.js';
import { matchesIdeaPathFilter } from './idea-path-filter.js';
import { insertIdeaReferenceAtCursor } from '../extension/insert-idea-reference.js';
import { openChatWithText } from '../ai_commands_module/open-chat.js';
import {
    assignWebviewHtmlWithRetry,
    safeAssignWebviewHtml,
    safeWebviewPost,
    yieldEventLoop
} from '../shared/safe-webview-post.js';

const VIEW_ID = 'reqlan.activityBar';
const EDITOR_DEBOUNCE_MS = 250;
/** Suppress editor-driven pane rebuilds briefly after programmatic open / file switch. */
const NAVIGATION_QUIET_MS = 650;
const IDEA_SEARCH_LIMIT = 40;
const TODO_LIST_LIMIT = 40;

let activeActivityBarProvider: ActivityBarWebviewProvider | undefined;

export function getActivityBarWebviewProvider(): ActivityBarWebviewProvider | undefined {
    return activeActivityBarProvider;
}

export class ActivityBarWebviewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private viewBindings: vscode.Disposable[] = [];
    /** True after this view instance posts `ready` — host must not post before then. */
    private webviewReady = false;
    private data?: ActivityBarDataService;
    private readonly contextSession: ContextSessionState = createContextSession();
    private syncWithEditor = true;
    private pinnedFocusId?: string;
    private editorTimer?: ReturnType<typeof setTimeout>;
    private requestGeneration = 0;
    private readonly statusUnsubscribe: () => void;
    private readonly catalogUnsubscribe: () => void;
    private visible = true;
    /** Last index readiness posted to panes — used to refresh context only on transitions. */
    private lastPostedReady = false;
    private lastPostedActiveBaseId?: string;
    /** Bumped to cancel in-flight fuzzy search bookkeeping on the host. */
    private ideaSearchEpoch = 0;
    /** Bumped to abort in-flight editor context refresh. */
    private refreshEpoch = 0;
    /** Until this timestamp, editor selection/focus events defer pane rebuilds. */
    private navigationQuietUntil = 0;
    /** Last editor document URI used for refresh — detects file switches vs selection moves. */
    private lastEditorDocumentUri?: string;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly submodule: AnalyticalSubmodule,
        private readonly activationGeneration: number,
        private readonly onPainted: () => void
    ) {
        this.statusUnsubscribe = submodule.index.subscribeStatusUpdates(() => {
            void this.postIndexHealth();
            this.refreshPanesIfIndexSettled();
        });
        this.catalogUnsubscribe = submodule.index.subscribeCatalogUpdates(() => {
            this.refreshPanesIfIndexSettled();
        });
    }

    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): Promise<void> {
        this.bindView(webviewView);
        const assigned = await assignWebviewHtmlWithRetry({
            isCurrent: () => this.view === webviewView,
            isCancelled: () => token.isCancellationRequested,
            assign: () =>
                safeAssignWebviewHtml(
                    webviewView.webview,
                    getActivityBarHtml(webviewView.webview, this.context.extensionUri)
                )
        });
        if (!assigned && this.view === webviewView && !token.isCancellationRequested) {
            console.error('[reqlan] Activity bar webview html assignment failed.');
        }
    }

    private bindView(webviewView: vscode.WebviewView): void {
        this.disposeViewBindings();
        this.view = webviewView;
        this.webviewReady = false;
        this.visible = webviewView.visible;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webviews', 'activity-bar')
            ]
        };
        this.viewBindings.push(
            webviewView.onDidChangeVisibility(() => {
                if (this.view !== webviewView) {
                    return;
                }
                this.visible = webviewView.visible;
                this.postEditorContext();
            }),
            webviewView.webview.onDidReceiveMessage(message => {
                if (this.view !== webviewView) {
                    return;
                }
                const msg = message as ActivityBarToExtensionMessage;
                // Interactive navigation must not sit behind search/refresh awaits.
                if (isInteractiveMessage(msg)) {
                    void this.handleInteractiveMessage(msg);
                    return;
                }
                void this.handleMessage(msg);
            }),
            webviewView.onDidDispose(() => {
                if (this.view !== webviewView) {
                    return;
                }
                this.view = undefined;
                this.webviewReady = false;
            })
        );
    }

    private disposeViewBindings(): void {
        for (const binding of this.viewBindings) {
            binding.dispose();
        }
        this.viewBindings = [];
    }

    recordEditorActivity(fileUri: string, line: number): void {
        recordFileVisit(this.contextSession, fileUri);
        recordFileEdit(this.contextSession, fileUri, line);
    }

    /** Active base root for lean openIndexFile (skip discoverBases on the click path). */
    activeBaseRoot(): string | undefined {
        return this.submodule.index.getActiveBase()?.descriptor.root;
    }

    /**
     * Quiet editor-driven rebuilds when the active document changes (document-link /
     * go-to-definition / openIdea). Selection moves within the same file stay on debounce only.
     */
    noteEditorNavigation(editor: vscode.TextEditor | undefined): void {
        if (!editor || !isWorkspaceEditor(editor)) {
            return;
        }
        const documentUri = editor.document.uri.toString();
        if (this.lastEditorDocumentUri !== undefined && this.lastEditorDocumentUri !== documentUri) {
            this.beginInteractiveNavigation();
        }
        this.lastEditorDocumentUri = documentUri;
    }

    disposeSubscriptions(): void {
        clearTimeout(this.editorTimer);
        this.refreshEpoch += 1;
        this.ideaSearchEpoch += 1;
        this.statusUnsubscribe();
        this.catalogUnsubscribe();
        this.disposeViewBindings();
        this.view = undefined;
        this.webviewReady = false;
    }

    /**
     * Bind the data service to the active base store when ready.
     * Never awaits sync — progress is event-driven via status → indexHealth.
     */
    private async ensureData(): Promise<ActivityBarDataService | undefined> {
        if (!this.submodule.index.isReady) {
            return undefined;
        }
        this.data = new ActivityBarDataService(
            this.submodule.index.indexStore,
            uri => vscode.workspace.asRelativePath(uri)
        );
        return this.data;
    }

    /** Rebuild editor panes only when the active base becomes ready or switches while ready. */
    private refreshPanesIfIndexSettled(): void {
        if (!this.syncWithEditor || !this.visible) {
            this.lastPostedReady = this.submodule.index.isReady;
            this.lastPostedActiveBaseId = this.submodule.index.getActiveBaseId();
            return;
        }
        const ready = this.submodule.index.isReady;
        const activeBaseId = this.submodule.index.getActiveBaseId();
        const becameReady = ready && !this.lastPostedReady;
        const baseChangedWhileReady =
            ready && activeBaseId !== undefined && activeBaseId !== this.lastPostedActiveBaseId;
        this.lastPostedReady = ready;
        this.lastPostedActiveBaseId = activeBaseId;
        if (becameReady || baseChangedWhileReady) {
            void this.refreshFromEditor({ followEditorBase: false });
        }
    }

    private post(message: ExtensionToActivityBarMessage): void {
        if (!this.webviewReady) {
            return;
        }
        safeWebviewPost(this.view?.webview, message);
    }

    /**
     * Focus the activity-bar Search pane with a seeded query and optional path filter.
     * rq:["../../../../reqlan rq/language/imports.rq".wildcard_references_webview]
     */
    async openSearch(options: { query: string; pathFilter?: string }): Promise<void> {
        await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
        this.post({
            type: 'focusIdeaSearch',
            query: options.query,
            pathFilter: options.pathFilter,
            expand: true
        });
    }

    private postEditorContext(): void {
        this.post({
            type: 'editorContext',
            syncWithEditor: this.syncWithEditor,
            globalHopDepth: this.contextSession.globalHopDepth,
            minHopDepth: CONTEXT_MIN_HOP_DEPTH,
            maxHopDepth: CONTEXT_MAX_HOP_DEPTH,
            dimensionHopDepth: { ...this.contextSession.dimensionHopDepth },
            pinnedFocusId: this.pinnedFocusId
        });
    }

    private postTray(): void {
        this.post({ type: 'tray', tray: { pinned: [...this.contextSession.manualIdeas] } });
    }

    private async buildContextInput(
        editor: vscode.TextEditor,
        options?: { includeFocusHistory?: boolean; git?: Awaited<ReturnType<typeof collectGitContext>> }
    ) {
        const active = this.submodule.index.getActiveBase();
        const baseRoot = active?.descriptor.root;
        const snapshot = this.submodule.index.getStatusSnapshot();
        const relativePath = (uri: string) => vscode.workspace.asRelativePath(uri);
        const fileUri = toIndexFileUri(editor.document.uri, baseRoot);
        const line = editor.selection.active.line;
        const workspaceRoot = baseRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const selection = editor.selection;
        const baseStatuses = this.submodule.index.statusByBase();

        let lineStart: number | undefined;
        let lineEnd: number | undefined;
        let useLineHistory = false;
        let focusIdea:
            | {
                  id: string;
                  name: string;
                  lineStart: number;
                  lineEnd: number;
              }
            | undefined;
        let peerIdeas:
            | Array<{
                  id: string;
                  name: string;
                  lineStart: number;
                  lineEnd: number;
              }>
            | undefined;
        try {
            if (!this.submodule.index.discoveryEmpty) {
                const store = this.submodule.index.indexStore;
                const ideasInFile = await store.listIdeasInFileWithRanges(fileUri);
                let idea = this.pinnedFocusId
                    ? ideasInFile.find(entry => entry.id === this.pinnedFocusId)
                    : undefined;
                idea ??= ideasInFile.find(
                    entry => entry.lineStart <= line && line <= entry.lineEnd
                );
                if (idea) {
                    focusIdea = {
                        id: idea.id,
                        name: idea.name,
                        lineStart: idea.lineStart,
                        lineEnd: idea.lineEnd
                    };
                    peerIdeas = ideasInFile.map(entry => ({
                        id: entry.id,
                        name: entry.name,
                        lineStart: entry.lineStart,
                        lineEnd: entry.lineEnd
                    }));
                    lineStart = idea.lineStart;
                    lineEnd = idea.lineEnd;
                    useLineHistory = true;
                } else if (fileUri.endsWith('.rq')) {
                    lineStart = line;
                    lineEnd = line;
                    useLineHistory = true;
                }
            }
        } catch {
            // History falls back to path log.
        }

        const git =
            options?.git ??
            (await collectGitContext({
                relativePath,
                workspaceRoot,
                focusFileUri: fileUri,
                lineStart,
                lineEnd,
                useLineHistory,
                focusIdea,
                peerIdeas,
                includeFocusHistory: options?.includeFocusHistory
            }));

        return {
            session: this.contextSession,
            fileUri,
            line,
            pinnedFocusId: this.pinnedFocusId,
            openFileUris: collectOpenWorkspaceFileUris(baseRoot),
            git,
            workspace: {
                ready: snapshot.ready,
                ideaCount: snapshot.ideaCount,
                edgeCount: snapshot.edgeCount,
                activeBaseId: active?.descriptor.id,
                activeBaseLabel: active?.descriptor.label,
                discoveryEmpty: this.submodule.index.discoveryEmpty,
                bases: baseStatuses.map(({ base, status }) => ({
                    id: base.id,
                    label: base.label,
                    root: base.root,
                    ready: status.ready,
                    ideaCount: status.ideaCount,
                    edgeCount: status.edgeCount,
                    fileIssueCount: status.fileIssueCount
                }))
            },
            fileText: editor.document.getText(),
            workspaceRoot,
            selectionRange: selection.isEmpty
                ? undefined
                : { startLine: selection.start.line, endLine: selection.end.line },
            activeGitChange: gitChangeForFile(fileUri, git),
            resolveFileRelated: async (targetUri: string) =>
                (await this.submodule.index.getAnalysisApi()).getFileContext(targetUri)
        };
    }

    private postPhonebookLinks(): void {
        const site = getPhonebookLink('site');
        this.post({
            type: 'phonebookLinks',
            links: [{ id: site.id, label: site.label, href: site.href }]
        });
    }

    private async postIndexHealth(): Promise<void> {
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
            type: 'indexHealth',
            status: toIndexStatusView(index.getStatusSnapshot(), {
                activeBaseId: index.getActiveBaseId(),
                discoveryEmpty: index.discoveryEmpty,
                bases
            })
        });
    }

    /**
     * @param followEditorBase When true, pin the base that owns the active editor file
     * (editor navigation). When false, keep the user-selected / currently active base.
     */
    private async refreshFromEditor(options?: { followEditorBase?: boolean }): Promise<void> {
        if (!this.visible || !this.syncWithEditor) {
            return;
        }
        if (Date.now() < this.navigationQuietUntil) {
            this.refreshFromEditorDebounced(options);
            return;
        }
        const epoch = ++this.refreshEpoch;
        const cancelled = (): boolean => epoch !== this.refreshEpoch;
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isWorkspaceEditor(editor)) {
            return;
        }
        if (options?.followEditorBase) {
            this.submodule.index.activateBaseForPath(editor.document.uri.fsPath);
        }
        const documentUri = editor.document.uri.toString();
        this.lastEditorDocumentUri = documentUri;
        const fileUri = toIndexFileUri(editor.document.uri, this.activeBaseRoot());
        recordFileVisit(this.contextSession, fileUri);
        if (!this.contextSession.expandedLens) {
            setExpandedLens(this.contextSession, 'current_file');
        }
        await yieldEventLoop();
        if (cancelled()) {
            return;
        }
        const model = await this.loadContext(editor);
        if (cancelled()) {
            return;
        }
        await yieldEventLoop();
        if (cancelled()) {
            return;
        }
        const focusId = model?.footprint.effectiveCenterId;
        if (focusId) {
            // loadContext already posts references — only refresh graph/ancestors here.
            await Promise.all([this.loadGraph(focusId), this.loadAncestors(focusId)]);
        }
    }

    /** Editor-driven refresh: follow the file's base. */
    refreshFromEditorDebounced(options?: { followEditorBase?: boolean }): void {
        clearTimeout(this.editorTimer);
        const followEditorBase = options?.followEditorBase ?? true;
        const run = (): void => {
            const waitMs = this.navigationQuietUntil - Date.now();
            if (waitMs > 0) {
                this.editorTimer = setTimeout(run, waitMs);
                return;
            }
            void this.refreshFromEditor({ followEditorBase });
        };
        this.editorTimer = setTimeout(run, EDITOR_DEBOUNCE_MS);
    }

    /** Cancel background search/refresh so openIdea stays on the interactive path. */
    beginInteractiveNavigation(): void {
        this.ideaSearchEpoch += 1;
        this.refreshEpoch += 1;
        this.navigationQuietUntil = Date.now() + NAVIGATION_QUIET_MS;
        clearTimeout(this.editorTimer);
    }

    private async handleInteractiveMessage(message: ActivityBarToExtensionMessage): Promise<void> {
        try {
            switch (message.type) {
                case 'openIdea':
                    this.beginInteractiveNavigation();
                    await openIndexFile(
                        message.fileUri,
                        message.line,
                        message.column,
                        this.activeBaseRoot()
                    );
                    break;
                case 'insertReference':
                    await insertIdeaReferenceAtCursor({
                        fileUri: message.fileUri,
                        name: message.name,
                        kind: message.kind
                    });
                    break;
                case 'addToChat':
                    await addSearchHitToChat(message);
                    break;
                case 'openPhonebookLink':
                    await openPhonebookLink(message.linkId);
                    break;
                case 'openIdeasSummary':
                    IdeasSummaryPanel.show(
                        this.context,
                        this.submodule,
                        this.activationGeneration,
                        {
                            ...message.intent,
                            baseId: message.intent.baseId ?? this.submodule.index.getActiveBaseId()
                        }
                    );
                    break;
                default:
                    await this.handleMessage(message);
                    break;
            }
        } catch (error) {
            this.post({
                type: 'error',
                message: error instanceof Error ? error.message : 'Activity bar request failed.',
                scope: scopeForMessage(message)
            });
        }
    }

    private nextRequestId(message: ActivityBarToExtensionMessage): number | undefined {
        return 'requestId' in message ? message.requestId : undefined;
    }

    private async handleMessage(message: ActivityBarToExtensionMessage): Promise<void> {
        const requestId = this.nextRequestId(message);
        try {
            switch (message.type) {
                case 'ready':
                    this.webviewReady = true;
                    this.onPainted();
                    this.postPhonebookLinks();
                    await this.postIndexHealth();
                    this.postTray();
                    this.postEditorContext();
                    await this.refreshFromEditor({ followEditorBase: true });
                    this.post({ type: 'bootstrapComplete' });
                    break;
                case 'loadScope':
                    await this.loadScope(message.fileUri, message.line, requestId);
                    break;
                case 'loadReferences':
                    await this.loadReferences(message.ideaId, requestId, message);
                    break;
                case 'loadGraph':
                    if (message.query.centerId) {
                        const hopDepth =
                            message.query.hopDepth ??
                            (message.query.includeIndirect ? 2 : this.contextSession.globalHopDepth);
                        await this.loadGraph(message.query.centerId, requestId, hopDepth);
                    } else {
                        this.post({
                            type: 'error',
                            message: 'No idea to centre the graph on.',
                            requestId,
                            scope: 'graph'
                        });
                    }
                    break;
                case 'loadAncestors':
                    await this.loadAncestors(message.ideaId, requestId, message.maxDepth);
                    break;
                case 'searchIdeas':
                    // Fire-and-forget: scoring runs in a worker; do not block the message loop.
                    void this.searchIdeas(message.query, requestId, message.pathFilter, message.offset);
                    break;
                case 'loadTodos':
                    await this.loadTodos(requestId);
                    break;
                case 'insertReference':
                    await insertIdeaReferenceAtCursor({
                        fileUri: message.fileUri,
                        name: message.name,
                        kind: message.kind
                    });
                    break;
                case 'addToChat':
                    await addSearchHitToChat(message);
                    break;
                case 'loadIndexHealth':
                    await this.postIndexHealth();
                    break;
                case 'refreshIndex':
                    // Fire-and-forget sync; indexHealth events drive the Workspace pane.
                    void this.submodule.index.syncWorkspace().then(async () => {
                        await this.postIndexHealth();
                        if (this.submodule.index.isReady) {
                            void this.refreshFromEditor({ followEditorBase: false });
                        }
                    });
                    await this.postIndexHealth();
                    break;
                case 'cancelIndexSync':
                    this.submodule.index.cancelSync();
                    await this.postIndexHealth();
                    break;
                case 'clearAndRebuildIndex': {
                    const confirmed = await vscode.window.showWarningMessage(
                        'Clear the idea index and rebuild it from scratch?',
                        { modal: true },
                        'Clear & rebuild'
                    );
                    if (confirmed === 'Clear & rebuild') {
                        await this.submodule.index.clearAndRebuildIndex();
                        await this.postIndexHealth();
                        await this.refreshFromEditor();
                    }
                    break;
                }
                case 'createBase':
                    await this.submodule.index.createBase();
                    await this.postIndexHealth();
                    await this.refreshFromEditor();
                    break;
                case 'selectBase': {
                    const baseId = message.baseId;
                    if (!this.submodule.index.getRegistered(baseId)) {
                        this.post({
                            type: 'error',
                            message: 'That base is no longer available.',
                            scope: 'index'
                        });
                        break;
                    }
                    // Pointer swap — status rebinds immediately; catch-up is fire-and-forget if not ready.
                    this.submodule.index.setActiveBaseId(baseId);
                    break;
                }
                case 'pinIdea':
                    await this.pinIdea(message.ideaId);
                    break;
                case 'unpinIdea':
                    unpinManualIdea(this.contextSession, message.ideaId);
                    this.postTray();
                    void this.refreshFromEditor();
                    break;
                case 'clearTray':
                    clearManualIdeas(this.contextSession);
                    this.postTray();
                    void this.refreshFromEditor();
                    break;
                case 'copyTrayMarkdown':
                    this.post({
                        type: 'trayMarkdown',
                        text: this.contextSession.manualIdeas
                            .map(idea => formatIdeaMarkdown(idea, uri => vscode.workspace.asRelativePath(uri)))
                            .join('\n\n---\n\n')
                    });
                    break;
                case 'copyScopeMarkdown': {
                    const data = await this.ensureData();
                    if (!data) {
                        break;
                    }
                    this.post({
                        type: 'scopeMarkdown',
                        text: await data.buildScopeMarkdown(message.ideaId)
                    });
                    break;
                }
                case 'copyContextMarkdown': {
                    const data = await this.ensureData();
                    const editor = vscode.window.activeTextEditor;
                    if (!data || !editor) {
                        break;
                    }
                    const model = await data.build(await this.buildContextInput(editor));
                    this.post({
                        type: 'contextMarkdown',
                        text: await data.buildContextMarkdown(model)
                    });
                    break;
                }
                case 'loadFileLens': {
                    const data = await this.ensureData();
                    if (!data) {
                        break;
                    }
                    const activeRoot = this.submodule.index.getActiveBase()?.descriptor.root;
                    const document = await vscode.workspace.openTextDocument(resolveIndexFileUri(message.fileUri, activeRoot));
                    const detail = await data.loadFileLensDetail(message.fileUri, {
                        fileText: document.getText(),
                        workspaceRoot: activeRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                        resolveFileRelated: async (targetUri: string) =>
                            (await this.submodule.index.getAnalysisApi()).getFileContext(targetUri)
                    });
                    this.post({ type: 'fileLensDetail', detail, requestId });
                    break;
                }
                case 'openIdeasSummary':
                    IdeasSummaryPanel.show(
                        this.context,
                        this.submodule,
                        this.activationGeneration,
                        {
                            ...message.intent,
                            baseId: message.intent.baseId ?? this.submodule.index.getActiveBaseId()
                        }
                    );
                    break;
                case 'openIdea':
                    this.beginInteractiveNavigation();
                    await openIndexFile(
                        message.fileUri,
                        message.line,
                        message.column,
                        this.activeBaseRoot()
                    );
                    break;
                case 'createStubIdea':
                    await this.createStubIdea(message.sourceIdeaId, message.refText);
                    break;
                case 'setSyncWithEditor':
                    this.syncWithEditor = message.enabled;
                    if (message.enabled) {
                        this.pinnedFocusId = undefined;
                    }
                    this.postEditorContext();
                    await this.refreshFromEditor();
                    break;
                case 'setPinnedFocus':
                    this.pinnedFocusId = message.ideaId;
                    this.syncWithEditor = false;
                    this.postEditorContext();
                    if (message.ideaId) {
                        const idea = await this.submodule.index.indexStore.getIdea(message.ideaId);
                        if (idea) {
                            await Promise.all([
                                this.loadReferences(idea.id),
                                this.loadGraph(idea.id),
                                this.loadAncestors(idea.id)
                            ]);
                        }
                    }
                    break;
                case 'setIncludeIndirect':
                    this.contextSession.globalHopDepth = message.enabled ? 2 : 1;
                    this.postEditorContext();
                    void this.refreshFromEditor();
                    break;
                case 'adjustGlobalHopDepth':
                    adjustGlobalHopDepth(this.contextSession, message.delta);
                    this.postEditorContext();
                    void this.refreshFromEditor();
                    break;
                case 'adjustDimensionHopDepth':
                    adjustDimensionHopDepth(this.contextSession, message.dimension, message.delta);
                    this.postEditorContext();
                    void this.refreshFromEditor();
                    break;
                case 'toggleContextDimension':
                    setDimensionEnabled(this.contextSession, message.dimension, message.enabled);
                    await this.refreshFromEditor();
                    break;
                case 'setExpandedLens':
                    setExpandedLens(this.contextSession, message.dimension);
                    await this.refreshFromEditor();
                    break;
                case 'openPhonebookLink':
                    await openPhonebookLink(message.linkId);
                    break;
            }
        } catch (error) {
            this.post({
                type: 'error',
                message: error instanceof Error ? error.message : 'Activity bar request failed.',
                requestId,
                scope: scopeForMessage(message)
            });
        }
    }

    private async loadContext(
        editor: vscode.TextEditor,
        requestId?: number
    ): Promise<import('./lib/context-model.js').ReqlanContextModel | undefined> {
        const data = await this.ensureData();
        if (!data) {
            // Cold start: index sync in progress — wait via indexHealth, not a hard error.
            await this.postIndexHealth();
            return undefined;
        }
        const epoch = this.refreshEpoch;
        // First paint: index-backed context + light git chrome only (no git log -L / parse-at-rev).
        const model = await data.build(
            await this.buildContextInput(editor, { includeFocusHistory: false })
        );
        this.post({ type: 'context', model, requestId });
        this.post({ type: 'scope', scope: model.currentFile, requestId });
        const focusId = model.footprint.effectiveCenterId;
        if (focusId) {
            const payload = await data.loadReferences(focusId, {
                fileUri: toIndexFileUri(editor.document.uri, this.activeBaseRoot()),
                fileText: editor.document.getText()
            });
            this.post({ type: 'references', payload, requestId });
        }
        void this.enrichContextGitHistory(editor, data, requestId, epoch);
        return model;
    }

    /** Deferred focus git history — must not block open or first context post. */
    private async enrichContextGitHistory(
        editor: vscode.TextEditor,
        data: ActivityBarDataService,
        requestId: number | undefined,
        epoch: number
    ): Promise<void> {
        try {
            await yieldEventLoop();
            if (epoch !== this.refreshEpoch) {
                return;
            }
            if (vscode.window.activeTextEditor?.document.uri.toString() !== editor.document.uri.toString()) {
                return;
            }
            const input = await this.buildContextInput(editor, { includeFocusHistory: true });
            if (epoch !== this.refreshEpoch) {
                return;
            }
            const model = await data.build(input);
            if (epoch !== this.refreshEpoch) {
                return;
            }
            this.post({ type: 'context', model, requestId });
            this.post({ type: 'scope', scope: model.currentFile, requestId });
        } catch {
            // Git enrichment is best-effort; first paint already shipped.
        }
    }

    /** @deprecated use loadContext */
    private async loadScope(fileUri: string, line: number, requestId?: number): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (editor && toIndexFileUri(editor.document.uri, this.activeBaseRoot()) === fileUri) {
            await this.loadContext(editor, requestId);
            return;
        }
        const document = await vscode.workspace.openTextDocument(
            resolveIndexFileUri(fileUri, this.activeBaseRoot())
        );
        const fakeEditor = {
            document,
            selection: new vscode.Selection(line, 0, line, 0)
        } as vscode.TextEditor;
        await this.loadContext(fakeEditor, requestId);
    }

    private async createStubIdea(sourceIdeaId: string, refText: string): Promise<void> {
        const name = refText.trim();
        if (!name) {
            return;
        }
        const idea = await this.submodule.index.indexStore.getIdea(sourceIdeaId);
        if (!idea) {
            void vscode.window.showWarningMessage('Could not locate the source idea for create.');
            return;
        }
        const documentUri = resolveIndexFileUri(idea.fileUri, this.activeBaseRoot()).toString();
        await vscode.commands.executeCommand(REQLAN_IMPORT_ERROR_CREATE_COMMAND, {
            documentUri,
            refText: name,
            range: {
                start: { line: Math.max(0, idea.lineStart), character: 0 },
                end: { line: Math.max(0, idea.lineStart), character: 0 }
            }
        });
    }

    private async loadReferences(
        ideaId: string,
        requestId?: number,
        options?: { search?: string; brokenOnly?: boolean }
    ): Promise<void> {
        const data = await this.ensureData();
        if (!data) {
            await this.postIndexHealth();
            this.post({
                type: 'error',
                message: 'Index is not ready yet.',
                requestId,
                scope: 'references'
            });
            return;
        }
        const hopDepth = effectiveHopDepth(this.contextSession, 'current_file');
        const editor = vscode.window.activeTextEditor;
        const fileUri = editor
            ? toIndexFileUri(editor.document.uri, this.activeBaseRoot())
            : ideaId.split('#')[0];
        const fileText = editor?.document.getText();
        const payload = await data.loadReferences(ideaId, {
            ...options,
            hopDepth,
            fileUri,
            fileText
        });
        this.post({ type: 'references', payload, requestId });
    }

    private async loadGraph(
        centerId: string,
        requestId?: number,
        hopDepth = this.contextSession.globalHopDepth
    ): Promise<void> {
        const data = await this.ensureData();
        if (!data) {
            await this.postIndexHealth();
            this.post({
                type: 'error',
                message: 'Index is not ready yet.',
                requestId,
                scope: 'graph'
            });
            return;
        }
        const generation = ++this.requestGeneration;
        const slice = await data.loadGraph(centerId, hopDepth);
        if (generation !== this.requestGeneration) {
            return;
        }
        this.post({ type: 'graphSlice', slice, requestId });
    }

    private async loadAncestors(
        ideaId: string,
        requestId?: number,
        maxDepth = effectiveHopDepth(this.contextSession, 'current_file')
    ): Promise<void> {
        const data = await this.ensureData();
        if (!data) {
            await this.postIndexHealth();
            this.post({
                type: 'error',
                message: 'Index is not ready yet.',
                requestId,
                scope: 'ancestors'
            });
            return;
        }
        const result = await data.loadAncestors(ideaId, maxDepth);
        this.post({ type: 'ancestors', result, requestId });
    }

    private async pinIdea(ideaId: string): Promise<void> {
        const idea = await this.submodule.index.indexStore.getIdea(ideaId);
        if (!idea || this.contextSession.manualIdeas.some(entry => entry.id === idea.id)) {
            this.postTray();
            return;
        }
        pinManualIdea(this.contextSession, idea);
        this.postTray();
        void this.refreshFromEditor();
    }

    private async searchIdeas(
        query: string,
        requestId?: number,
        pathFilter?: string,
        offset = 0
    ): Promise<void> {
        // rq:["../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_load_more]
        // rq:["../../../../reqlan rq/core_analysis/search.rq".file_search]
        if (!this.submodule.index.isReady) {
            this.post({
                type: 'error',
                message: 'Index is not ready yet.',
                requestId,
                scope: 'search'
            });
            return;
        }
        const trimmed = query.trim();
        const requestedOffset = Math.max(0, offset);
        if (!trimmed) {
            this.post({
                type: 'ideaSearchResults',
                payload: {
                    query: '',
                    total: 0,
                    truncated: false,
                    offset: 0,
                    nextOffset: 0,
                    results: []
                },
                requestId
            });
            return;
        }
        const epoch = ++this.ideaSearchEpoch;
        const searchRequestId = requestId ?? epoch;
        const postProgress = (message: string, detail?: string): void => {
            if (epoch !== this.ideaSearchEpoch || requestedOffset > 0) {
                return;
            }
            this.post({
                type: 'ideaSearchProgress',
                payload: { phase: 'search', message, detail },
                requestId: searchRequestId
            });
        };
        try {
            postProgress('Scoring ideas…');
            await yieldEventLoop();
            if (epoch !== this.ideaSearchEpoch) {
                return;
            }
            // Over-fetch when path filtering so a page can still fill after the AND filter.
            const fetchLimit = pathFilter?.trim()
                ? Math.max(IDEA_SEARCH_LIMIT * 8, 200)
                : IDEA_SEARCH_LIMIT;
            const { hits, truncated: nativeTruncated, total } = this.submodule.index.fuzzySearch(trimmed, {
                limit: fetchLimit,
                offset: requestedOffset,
                requireQuery: true
            });
            if (epoch !== this.ideaSearchEpoch) {
                return;
            }
            const mapped = hits.map(hit => ({
                id: hit.id,
                name: hit.name,
                kind: hit.kind,
                path: vscode.workspace.asRelativePath(hit.fileUri),
                summary: hit.summary,
                fileUri: hit.fileUri,
                lineStart: hit.lineStart
            }));
            const results: typeof mapped = [];
            let consumed = 0;
            for (const hit of mapped) {
                consumed += 1;
                if (
                    pathFilter?.trim()
                    && !matchesIdeaPathFilter(hit.path, hit.fileUri, pathFilter)
                ) {
                    continue;
                }
                results.push(hit);
                if (results.length >= IDEA_SEARCH_LIMIT) {
                    break;
                }
            }
            this.post({
                type: 'ideaSearchResults',
                payload: {
                    query: trimmed,
                    total,
                    truncated: nativeTruncated || consumed < mapped.length,
                    offset: requestedOffset,
                    nextOffset: requestedOffset + consumed,
                    results
                },
                requestId
            });
        } catch (error) {
            if (epoch !== this.ideaSearchEpoch) {
                return;
            }
            this.post({
                type: 'error',
                message: error instanceof Error ? error.message : 'Search failed.',
                requestId,
                scope: 'search'
            });
        }
    }

    private async loadTodos(requestId?: number): Promise<void> {
        if (!this.submodule.index.isReady) {
            this.post({
                type: 'error',
                message: 'Index is not ready yet.',
                requestId,
                scope: 'todos'
            });
            return;
        }
        const result = await this.submodule.index.indexStore.listTodoIdeas(TODO_LIST_LIMIT);
        const truncated = result.total > result.ideas.length;
        this.post({
            type: 'todoList',
            payload: {
                total: result.total,
                truncated,
                results: result.ideas.map(idea => ({
                    id: idea.id,
                    name: idea.name,
                    kind: idea.kind,
                    path: vscode.workspace.asRelativePath(idea.fileUri),
                    summary: idea.summary,
                    fileUri: idea.fileUri,
                    lineStart: idea.lineStart,
                    todoNote: idea.todoNote
                }))
            },
            requestId
        });
    }
}

function isInteractiveMessage(message: ActivityBarToExtensionMessage): boolean {
    switch (message.type) {
        case 'openIdea':
        case 'insertReference':
        case 'addToChat':
        case 'openPhonebookLink':
        case 'openIdeasSummary':
            return true;
        default:
            return false;
    }
}

/** Compact #requirement payload for search hits → chat input (isPartialQuery). */
async function addSearchHitToChat(hit: {
    name: string;
    path: string;
    summary: string;
    lineStart: number;
    target?: 'current' | 'new';
}): Promise<void> {
    const location = `${hit.path}:${hit.lineStart + 1}`;
    const contextText = [
        `**${hit.name}**`,
        location,
        hit.summary || '(no summary)'
    ].join('\n');
    const query = `#requirement ${hit.name}\n\n${contextText}`;
    const target = hit.target ?? 'current';
    const opened = await openChatWithText(query, { isPartialQuery: true, target });
    if (!opened) {
        await vscode.env.clipboard.writeText(query);
        void vscode.window.showInformationMessage(
            target === 'new'
                ? 'Idea context copied to clipboard. Paste it into a new chat.'
                : 'Idea context copied to clipboard. Paste it into chat.'
        );
    }
}

function scopeForMessage(
    message: ActivityBarToExtensionMessage
): import('./activity-bar-messages.js').ActivityBarErrorScope | undefined {
    switch (message.type) {
        case 'loadGraph':
            return 'graph';
        case 'loadReferences':
            return 'references';
        case 'loadAncestors':
            return 'ancestors';
        case 'searchIdeas':
            return 'search';
        case 'loadTodos':
            return 'todos';
        case 'loadScope':
        case 'loadFileLens':
        case 'copyScopeMarkdown':
        case 'copyContextMarkdown':
            return 'context';
        case 'refreshIndex':
        case 'cancelIndexSync':
        case 'clearAndRebuildIndex':
        case 'loadIndexHealth':
            return 'index';
        default:
            return 'bootstrap';
    }
}

function collectOpenWorkspaceFileUris(baseRoot?: string): string[] {
    const uris = new Set<string>();
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (input instanceof vscode.TabInputText) {
                if (vscode.workspace.getWorkspaceFolder(input.uri)) {
                    uris.add(toIndexFileUri(input.uri, baseRoot));
                }
            }
        }
    }
    return [...uris];
}

function isWorkspaceEditor(editor: vscode.TextEditor): boolean {
    return vscode.workspace.getWorkspaceFolder(editor.document.uri) !== undefined;
}

async function openPhonebookLink(linkId: string): Promise<void> {
    const link = getPhonebookLink(linkId as PhonebookLinkId);
    await vscode.env.openExternal(vscode.Uri.parse(link.href));
}

export function registerActivityBarWebview(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule,
    activationGeneration: number,
    onPainted: () => void
): ActivityBarWebviewProvider {
    const provider = new ActivityBarWebviewProvider(
        context,
        submodule,
        activationGeneration,
        onPainted
    );
    activeActivityBarProvider = provider;
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            provider.noteEditorNavigation(editor);
            provider.refreshFromEditorDebounced({ followEditorBase: true });
        }),
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (isWorkspaceEditor(event.textEditor)) {
                const fileUri = toIndexFileUri(event.textEditor.document.uri, provider.activeBaseRoot());
                const line = event.selections[0]?.active.line ?? 0;
                provider.recordEditorActivity(fileUri, line);
                provider.refreshFromEditorDebounced({ followEditorBase: true });
            }
        }),
        vscode.commands.registerCommand('reqlan.refreshActivityBar', () => {
            provider.refreshFromEditorDebounced({ followEditorBase: true });
        }),
        vscode.commands.registerCommand('reqlan.openIdeaFromActivityBar', async (fileUri: string, line: number) => {
            provider.beginInteractiveNavigation();
            await openIndexFile(
                fileUri,
                line,
                0,
                provider.activeBaseRoot()
            );
        }),
        {
            dispose: () => {
                provider.disposeSubscriptions();
                if (activeActivityBarProvider === provider) {
                    activeActivityBarProvider = undefined;
                }
            }
        }
    );
    return provider;
}

export type { IdeasSummaryIntent };

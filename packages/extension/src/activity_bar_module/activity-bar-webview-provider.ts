import * as vscode from 'vscode';
import type { FileRelatedRequirements } from 'reqlan-analytical';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
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
    type ContextSessionState
} from './context-session.js';
import { getActivityBarHtml } from './get-activity-bar-html.js';
import type {
    ActivityBarToExtensionMessage,
    ExtensionToActivityBarMessage,
    IdeasSummaryIntent
} from './activity-bar-messages.js';

const VIEW_ID = 'reqlan.activityBar';
const EDITOR_DEBOUNCE_MS = 250;

export class ActivityBarWebviewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private data?: ActivityBarDataService;
    private readonly contextSession: ContextSessionState = createContextSession();
    private syncWithEditor = true;
    private includeIndirect = false;
    private pinnedFocusId?: string;
    private editorTimer?: ReturnType<typeof setTimeout>;
    private requestGeneration = 0;
    private readonly statusUnsubscribe: () => void;
    private readonly catalogUnsubscribe: () => void;
    private visible = true;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly submodule: AnalyticalSubmodule,
        private readonly activationGeneration: number
    ) {
        this.statusUnsubscribe = submodule.index.subscribeStatusUpdates(() => {
            void this.postIndexHealth();
            if (this.syncWithEditor) {
                void this.refreshFromEditor();
            }
        });
        this.catalogUnsubscribe = submodule.index.subscribeCatalogUpdates(() => {
            if (this.syncWithEditor) {
                void this.refreshFromEditor();
            }
        });
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webviews', 'activity-bar')
            ]
        };
        webviewView.webview.html = getActivityBarHtml(webviewView.webview, this.context.extensionUri);

        webviewView.onDidChangeVisibility(() => {
            this.visible = webviewView.visible;
            this.postEditorContext();
        });

        webviewView.webview.onDidReceiveMessage(message => {
            void this.handleMessage(message as ActivityBarToExtensionMessage);
        });

        void this.ensureData();
        this.postPhonebookLinks();
        this.postTray();
        this.postEditorContext();
        void this.refreshFromEditor();
    }

    refreshFromEditorDebounced(): void {
        clearTimeout(this.editorTimer);
        this.editorTimer = setTimeout(() => {
            void this.refreshFromEditor();
        }, EDITOR_DEBOUNCE_MS);
    }

    recordEditorActivity(fileUri: string, line: number): void {
        recordFileVisit(this.contextSession, fileUri);
        recordFileEdit(this.contextSession, fileUri, line);
    }

    disposeSubscriptions(): void {
        clearTimeout(this.editorTimer);
        this.statusUnsubscribe();
        this.catalogUnsubscribe();
    }

    private async ensureData(): Promise<ActivityBarDataService | undefined> {
        if (!this.submodule.index.isReady) {
            await this.submodule.index.syncWorkspace();
        }
        if (!this.submodule.index.isReady) {
            return undefined;
        }
        this.data = new ActivityBarDataService(
            this.submodule.index.indexStore,
            uri => vscode.workspace.asRelativePath(uri)
        );
        return this.data;
    }

    private post(message: ExtensionToActivityBarMessage): void {
        void this.view?.webview.postMessage(message);
    }

    private postEditorContext(): void {
        this.post({
            type: 'editorContext',
            syncWithEditor: this.syncWithEditor,
            includeIndirect: this.includeIndirect,
            pinnedFocusId: this.pinnedFocusId
        });
    }

    private postTray(): void {
        this.post({ type: 'tray', tray: { pinned: [...this.contextSession.manualIdeas] } });
    }

    private buildContextInput(editor: vscode.TextEditor) {
        const snapshot = this.submodule.index.getStatusSnapshot();
        const relativePath = (uri: string) => vscode.workspace.asRelativePath(uri);
        const fileUri = toIndexFileUri(editor.document.uri);
        const line = editor.selection.active.line;
        const git = collectGitContext(relativePath);
        const selection = editor.selection;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        return {
            session: this.contextSession,
            fileUri,
            line,
            pinnedFocusId: this.pinnedFocusId,
            openFileUris: collectOpenWorkspaceFileUris(),
            git,
            workspace: {
                ready: snapshot.ready,
                ideaCount: snapshot.ideaCount,
                edgeCount: snapshot.edgeCount
            },
            fileText: editor.document.getText(),
            workspaceRoot,
            selectionRange: selection.isEmpty
                ? undefined
                : { startLine: selection.start.line, endLine: selection.end.line },
            activeGitChange: gitChangeForFile(fileUri, git),
            resolveFileRelated: async (targetUri: string) =>
                this.submodule.analysers.run<{ fileUri: string }, FileRelatedRequirements>(
                    {
                        store: this.submodule.index.indexStore,
                        analytical: this.submodule.store,
                        workspaceRoot
                    },
                    'file_related_requirements',
                    { fileUri: targetUri }
                )
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
        this.post({
            type: 'indexHealth',
            status: toIndexStatusView(this.submodule.index.getStatusSnapshot())
        });
    }

    private async refreshFromEditor(): Promise<void> {
        if (!this.visible || !this.syncWithEditor) {
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isWorkspaceEditor(editor)) {
            return;
        }
        const fileUri = toIndexFileUri(editor.document.uri);
        recordFileVisit(this.contextSession, fileUri);
        if (!this.contextSession.expandedLens) {
            setExpandedLens(this.contextSession, 'current_file');
        }
        const model = await this.loadContext(editor);
        const focusId = model?.footprint.effectiveCenterId;
        if (focusId) {
            await Promise.all([
                this.loadReferences(focusId),
                this.loadGraph(focusId),
                this.loadAncestors(focusId)
            ]);
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
                    this.postPhonebookLinks();
                    await this.postIndexHealth();
                    this.postTray();
                    this.postEditorContext();
                    await this.refreshFromEditor();
                    break;
                case 'loadScope':
                    await this.loadScope(message.fileUri, message.line, requestId);
                    break;
                case 'loadReferences':
                    await this.loadReferences(message.ideaId, requestId, message);
                    break;
                case 'loadGraph':
                    if (message.query.centerId) {
                        await this.loadGraph(message.query.centerId, requestId, message.query.includeIndirect);
                    } else {
                        this.post({
                            type: 'error',
                            message: 'No idea to centre the graph on.',
                            requestId
                        });
                    }
                    break;
                case 'loadAncestors':
                    await this.loadAncestors(message.ideaId, requestId, message.maxDepth);
                    break;
                case 'loadIndexHealth':
                    await this.postIndexHealth();
                    break;
                case 'refreshIndex':
                    await this.submodule.index.syncWorkspace();
                    await this.postIndexHealth();
                    await this.refreshFromEditor();
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
                    const model = await data.build(this.buildContextInput(editor));
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
                    const document = await vscode.workspace.openTextDocument(resolveIndexFileUri(message.fileUri));
                    const detail = await data.loadFileLensDetail(message.fileUri, {
                        fileText: document.getText(),
                        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                        resolveFileRelated: async (targetUri: string) =>
                            this.submodule.analysers.run<{ fileUri: string }, FileRelatedRequirements>(
                                {
                                    store: this.submodule.index.indexStore,
                                    analytical: this.submodule.store,
                                    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                                },
                                'file_related_requirements',
                                { fileUri: targetUri }
                            )
                    });
                    this.post({ type: 'fileLensDetail', detail, requestId });
                    break;
                }
                case 'openIdeasSummary':
                    IdeasSummaryPanel.show(
                        this.context,
                        this.submodule,
                        this.activationGeneration,
                        message.intent
                    );
                    break;
                case 'openIdea':
                    await openIdea(message.fileUri, message.line, message.column);
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
                    this.includeIndirect = message.enabled;
                    this.postEditorContext();
                    if (this.pinnedFocusId || this.syncWithEditor) {
                        await this.refreshFromEditor();
                    }
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
                requestId
            });
        }
    }

    private async loadContext(
        editor: vscode.TextEditor,
        requestId?: number
    ): Promise<import('reqlan-analytical').ReqlanContextModel | undefined> {
        const data = await this.ensureData();
        if (!data) {
            this.post({ type: 'error', message: 'Index is not ready yet.', requestId });
            return undefined;
        }
        const model = await data.build(this.buildContextInput(editor));
        this.post({ type: 'context', model, requestId });
        this.post({ type: 'scope', scope: model.currentFile, requestId });
        const focusId = model.footprint.effectiveCenterId;
        if (focusId) {
            const payload = await data.loadReferences(focusId);
            this.post({ type: 'references', payload, requestId });
        }
        return model;
    }

    /** @deprecated use loadContext */
    private async loadScope(fileUri: string, line: number, requestId?: number): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (editor && toIndexFileUri(editor.document.uri) === fileUri) {
            await this.loadContext(editor, requestId);
            return;
        }
        const document = await vscode.workspace.openTextDocument(resolveIndexFileUri(fileUri));
        const fakeEditor = {
            document,
            selection: new vscode.Selection(line, 0, line, 0)
        } as vscode.TextEditor;
        await this.loadContext(fakeEditor, requestId);
    }

    private async loadReferences(
        ideaId: string,
        requestId?: number,
        options?: { search?: string; brokenOnly?: boolean }
    ): Promise<void> {
        const data = await this.ensureData();
        if (!data) {
            return;
        }
        const payload = await data.loadReferences(ideaId, options);
        this.post({ type: 'references', payload, requestId });
    }

    private async loadGraph(
        centerId: string,
        requestId?: number,
        includeIndirect = this.includeIndirect
    ): Promise<void> {
        const data = await this.ensureData();
        if (!data) {
            this.post({
                type: 'error',
                message: 'Index is not ready yet.',
                requestId
            });
            return;
        }
        const generation = ++this.requestGeneration;
        const slice = await data.loadGraph(centerId, includeIndirect);
        if (generation !== this.requestGeneration) {
            return;
        }
        this.post({ type: 'graphSlice', slice, requestId });
    }

    private async loadAncestors(
        ideaId: string,
        requestId?: number,
        maxDepth = 8
    ): Promise<void> {
        const data = await this.ensureData();
        if (!data) {
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
}

function collectOpenWorkspaceFileUris(): string[] {
    const uris = new Set<string>();
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (input instanceof vscode.TabInputText) {
                if (vscode.workspace.getWorkspaceFolder(input.uri)) {
                    uris.add(toIndexFileUri(input.uri));
                }
            }
        }
    }
    return [...uris];
}

function isWorkspaceEditor(editor: vscode.TextEditor): boolean {
    return vscode.workspace.getWorkspaceFolder(editor.document.uri) !== undefined;
}

async function openIdea(fileUri: string, line: number, column = 0): Promise<void> {
    const uri = resolveIndexFileUri(fileUri);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(line, column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
}

async function openPhonebookLink(linkId: string): Promise<void> {
    const link = getPhonebookLink(linkId as PhonebookLinkId);
    await vscode.env.openExternal(vscode.Uri.parse(link.href));
}

export function registerActivityBarWebview(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule,
    activationGeneration: number
): ActivityBarWebviewProvider {
    const provider = new ActivityBarWebviewProvider(context, submodule, activationGeneration);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        }),
        vscode.window.onDidChangeActiveTextEditor(() => provider.refreshFromEditorDebounced()),
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (isWorkspaceEditor(event.textEditor)) {
                const fileUri = toIndexFileUri(event.textEditor.document.uri);
                const line = event.selections[0]?.active.line ?? 0;
                provider.recordEditorActivity(fileUri, line);
                provider.refreshFromEditorDebounced();
            }
        }),
        vscode.commands.registerCommand('reqlan.refreshActivityBar', () => {
            provider.refreshFromEditorDebounced();
        }),
        vscode.commands.registerCommand('reqlan.openIdeaFromActivityBar', async (fileUri: string, line: number) => {
            await openIdea(fileUri, line);
        }),
        { dispose: () => provider.disposeSubscriptions() }
    );
    return provider;
}

export type { IdeasSummaryIntent };

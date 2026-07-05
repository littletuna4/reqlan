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
    type IndexStatusView,
    type WebviewToExtensionMessage
} from './messages.js';
import { renderIdeasSummaryHtml } from './render-ideas-summary-html.js';
import { resolveIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

const VIEW_TYPE = 'reqlan.ideasSummary';

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
                retainContextWhenHidden: true
            }
        );
        this.panel.webview.html = renderIdeasSummaryHtml();

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
                await this.submodule.index.syncWorkspace();
                await this.sendIndexStatus();
                if (this.submodule.index.isReady) {
                    await this.sendIdeasPage(0);
                    await this.sendIdeasetsPage(0);
                    await this.sendReferencesPage(0);
                }
                break;
            case 'loadIdeas':
                await this.sendIdeasPage(message.page);
                break;
            case 'loadIdeasets':
                await this.sendIdeasetsPage(message.page);
                break;
            case 'loadReferences':
                await this.sendReferencesPage(message.page);
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

    private async bootstrapData(): Promise<void> {
        await this.submodule.index.syncWorkspace();
        await this.sendIndexStatus();
        if (this.submodule.index.isReady) {
            await this.sendIdeasPage(0);
            await this.sendIdeasetsPage(0);
            await this.sendReferencesPage(0);
        }
    }

    private async sendIndexStatus(): Promise<void> {
        this.post({ type: 'indexStatus', status: toIndexStatusView(this.submodule.index.getStatusSnapshot()) });
    }

    private async sendIdeasPage(page: number): Promise<void> {
        if (!this.submodule.index.isReady) {
            return;
        }
        const store = this.submodule.index.indexStore;
        const total = await store.countIdeas();
        const safePage = clampPage(page, total, IDEAS_PAGE_SIZE);
        const rows = (await store.listIdeasPage(safePage * IDEAS_PAGE_SIZE, IDEAS_PAGE_SIZE))
            .map(row => ({
                ...row,
                path: vscode.workspace.asRelativePath(row.path)
            }));
        this.post({
            type: 'ideasPage',
            page: safePage,
            pageSize: IDEAS_PAGE_SIZE,
            total,
            rows
        });
    }

    private async sendIdeasetsPage(page: number): Promise<void> {
        if (!this.submodule.index.isReady) {
            return;
        }
        const store = this.submodule.index.indexStore;
        const total = await store.countIdeasets();
        const safePage = clampPage(page, total, IDEASETS_PAGE_SIZE);
        const rows = (await store.listIdeasetsPage(safePage * IDEASETS_PAGE_SIZE, IDEASETS_PAGE_SIZE))
            .map(row => ({
                ...row,
                path: vscode.workspace.asRelativePath(row.path)
            }));
        this.post({
            type: 'ideasetsPage',
            page: safePage,
            pageSize: IDEASETS_PAGE_SIZE,
            total,
            rows
        });
    }

    private async sendReferencesPage(page: number): Promise<void> {
        if (!this.submodule.index.isReady) {
            return;
        }
        const store = this.submodule.index.indexStore;
        const total = await store.countReferences();
        const safePage = clampPage(page, total, REFERENCES_PAGE_SIZE);
        const rows = (await store.listReferencesPage(safePage * REFERENCES_PAGE_SIZE, REFERENCES_PAGE_SIZE))
            .map(row => ({
                ...row,
                sourcePath: vscode.workspace.asRelativePath(row.sourcePath),
                targetPath: row.targetPath ? vscode.workspace.asRelativePath(row.targetPath) : '—'
            }));
        this.post({
            type: 'referencesPage',
            page: safePage,
            pageSize: REFERENCES_PAGE_SIZE,
            total,
            rows
        });
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

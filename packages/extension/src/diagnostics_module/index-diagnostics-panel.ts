/**
 * Editor webview panel for index timing diagnostics.
 *
 * rq:["../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_webview]
 */
import * as vscode from 'vscode';
import { join } from 'node:path';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { getIndexDiagnosticsHtml } from './get-index-diagnostics-html.js';
import { safeWebviewPost } from '../shared/safe-webview-post.js';
import type {
    ExtensionToIndexDiagnosticsMessage,
    IndexDiagnosticsToExtensionMessage
} from './index-diagnostics-messages.js';

const VIEW_TYPE = 'reqlan.indexDiagnostics';

export class IndexDiagnosticsPanel {
    private static current?: IndexDiagnosticsPanel;

    static show(
        context: vscode.ExtensionContext,
        submodule: AnalyticalSubmodule
    ): void {
        if (IndexDiagnosticsPanel.current) {
            IndexDiagnosticsPanel.current.panel.reveal(vscode.ViewColumn.Beside);
            void IndexDiagnosticsPanel.current.postSnapshot();
            return;
        }
        IndexDiagnosticsPanel.current = new IndexDiagnosticsPanel(context, submodule);
    }

    readonly panel: vscode.WebviewPanel;
    private selectedRunId: number | undefined;
    private fileOrder: 'duration_desc' | 'duration_asc' | 'path' = 'duration_desc';

    private constructor(
        context: vscode.ExtensionContext,
        private readonly submodule: AnalyticalSubmodule
    ) {
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            'Index Diagnostics',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media', 'webviews', 'index-diagnostics'),
                ],
            },
        );

        this.panel.webview.html = getIndexDiagnosticsHtml(this.panel.webview, context.extensionUri);

        this.panel.webview.onDidReceiveMessage(
            (message: IndexDiagnosticsToExtensionMessage) => {
                void this.handleMessage(message);
            },
            undefined,
            context.subscriptions,
        );

        this.panel.onDidDispose(
            () => {
                IndexDiagnosticsPanel.current = undefined;
            },
            undefined,
            context.subscriptions,
        );
    }

    private post(message: ExtensionToIndexDiagnosticsMessage): void {
        safeWebviewPost(this.panel.webview, message);
    }

    private async handleMessage(message: IndexDiagnosticsToExtensionMessage): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        switch (message.type) {
            case 'ready':
            case 'refresh':
                await this.postSnapshot();
                return;
            case 'selectRun':
                this.selectedRunId = message.runId;
                await this.postSnapshot();
                return;
            case 'setFileOrder':
                this.fileOrder = message.order;
                await this.postSnapshot();
                return;
            case 'openFile':
                await this.openFile(message.fileUri);
                return;
        }
    }

    private async postSnapshot(): Promise<void> {
        const active = this.submodule.index.getActiveBase();
        if (!active) {
            this.post({
                type: 'error',
                message: 'No active reqlan base. Create a .reqlan folder first.',
            });
            return;
        }

        try {
            const overview = await this.submodule.index.getIndexDiagnosticsOverview();
            const runs = await this.submodule.index.listIndexDiagnosticRuns(30);
            const selectedRunId = this.selectedRunId && runs.some(r => r.id === this.selectedRunId)
                ? this.selectedRunId
                : runs[0]?.id;
            this.selectedRunId = selectedRunId;
            const selectedRun = selectedRunId === undefined
                ? undefined
                : await this.submodule.index.getIndexDiagnosticRun(selectedRunId);
            const files = selectedRunId === undefined
                ? []
                : await this.submodule.index.listIndexDiagnosticFileTimings(selectedRunId, {
                    order: this.fileOrder,
                    limit: 500,
                });

            this.post({
                type: 'snapshot',
                baseLabel: active.descriptor.label,
                baseRoot: active.descriptor.root,
                overview,
                runs,
                selectedRunId,
                selectedRun,
                files,
                fileOrder: this.fileOrder,
            });
        } catch (error) {
            this.post({
                type: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async openFile(fileUri: string): Promise<void> {
        const active = this.submodule.index.getActiveBase();
        if (!active) {
            return;
        }
        const abs = fileUri.includes('/') || fileUri.includes('\\')
            ? (fileUri.startsWith('/') || /^[A-Za-z]:/.test(fileUri)
                ? fileUri
                : join(active.descriptor.root, fileUri))
            : join(active.descriptor.root, fileUri);
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
            await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
        } catch {
            void vscode.window.showWarningMessage(`Could not open ${fileUri}`);
        }
    }
}

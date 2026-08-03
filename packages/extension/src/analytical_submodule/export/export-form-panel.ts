/**
 * Webview panel for HTML export options (simple + advanced).
 */
import * as vscode from 'vscode';
import { basename } from 'node:path';
import {
    exportHtml,
    type ExportRequest
} from '@reqlan/analytical';
import type { AnalyticalSubmodule } from '../index.js';
import { toIndexFileUri } from '../index-store/resolve-index-file-uri.js';
import type {
    ExportFormToExtensionMessage,
    ExtensionToExportFormMessage
} from './export-form-messages.js';
import {
    exportSettingsPath,
    loadExportFormSettings,
    resolveOutputDir,
    saveExportFormSettings,
    type ExportFormSettings
} from './export-settings.js';
import { getExportFormHtml } from './get-export-form-html.js';

const VIEW_TYPE = 'reqlan.exportHtmlForm';

export class ExportFormPanel {
    private static current?: ExportFormPanel;

    static show(
        context: vscode.ExtensionContext,
        submodule: AnalyticalSubmodule
    ): void {
        if (ExportFormPanel.current) {
            ExportFormPanel.current.panel.reveal(vscode.ViewColumn.One);
            ExportFormPanel.current.postInit();
            return;
        }
        ExportFormPanel.current = new ExportFormPanel(context, submodule);
    }

    readonly panel: vscode.WebviewPanel;
    private exporting = false;

    private constructor(
        context: vscode.ExtensionContext,
        private readonly submodule: AnalyticalSubmodule
    ) {
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            'Export HTML',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media', 'webviews', 'export-form'),
                ],
            },
        );

        this.panel.webview.html = getExportFormHtml(this.panel.webview, context.extensionUri);

        this.panel.webview.onDidReceiveMessage(
            (message: ExportFormToExtensionMessage) => {
                void this.handleMessage(message);
            },
            undefined,
            context.subscriptions,
        );

        this.panel.onDidDispose(
            () => {
                ExportFormPanel.current = undefined;
            },
            undefined,
            context.subscriptions,
        );
    }

    private workspaceRoot(): string | undefined {
        return (
            this.submodule.index.getActiveBase()?.descriptor.root ??
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        );
    }

    private activeRqDocument(): vscode.TextDocument | undefined {
        const active = vscode.window.activeTextEditor?.document;
        return active?.languageId === 'reqlan' ? active : undefined;
    }

    private postInit(): void {
        const workspaceRoot = this.workspaceRoot();
        if (!workspaceRoot) {
            return;
        }
        const settings = loadExportFormSettings(workspaceRoot);
        const sourceDocument = this.activeRqDocument();
        const message: ExtensionToExportFormMessage = {
            type: 'init',
            payload: {
                settings,
                resolvedOutputDir: resolveOutputDir(workspaceRoot, settings.outputDir),
                workspaceRoot,
                canExportCurrentFile: Boolean(sourceDocument),
                activeRqFileName: sourceDocument ? basename(sourceDocument.uri.fsPath) : undefined,
                settingsPath: exportSettingsPath(workspaceRoot),
            },
        };
        void this.panel.webview.postMessage(message);
    }

    private post(message: ExtensionToExportFormMessage): void {
        void this.panel.webview.postMessage(message);
    }

    private async handleMessage(message: ExportFormToExtensionMessage): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        switch (message.type) {
            case 'ready':
                this.postInit();
                return;
            case 'pickOutputDir':
                await this.pickOutputDir(message.currentOutputDir);
                return;
            case 'saveSettings':
                this.persistSettings(message.settings, true);
                return;
            case 'runExport':
                await this.runExport(message.settings);
                return;
        }
    }

    private persistSettings(settings: ExportFormSettings, notify: boolean): boolean {
        const workspaceRoot = this.workspaceRoot();
        if (!workspaceRoot) {
            if (notify) {
                this.post({
                    type: 'settingsSaved',
                    ok: false,
                    message: 'Open a workspace folder before saving export settings.',
                });
            }
            return false;
        }
        const validationError = validateSettings(settings);
        if (validationError) {
            if (notify) {
                this.post({ type: 'settingsSaved', ok: false, message: validationError });
            }
            return false;
        }
        try {
            saveExportFormSettings(workspaceRoot, settings);
            if (notify) {
                this.post({
                    type: 'settingsSaved',
                    ok: true,
                    message: `Saved to ${exportSettingsPath(workspaceRoot)}`,
                });
            }
            return true;
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            if (notify) {
                this.post({ type: 'settingsSaved', ok: false, message: detail });
            }
            return false;
        }
    }

    private async pickOutputDir(currentOutputDir: string): Promise<void> {
        const workspaceRoot = this.workspaceRoot();
        if (!workspaceRoot) {
            return;
        }
        const defaultUri = vscode.Uri.file(resolveOutputDir(workspaceRoot, currentOutputDir));
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri,
            openLabel: 'Select export folder',
        });
        const folder = picked?.[0]?.fsPath;
        if (!folder) {
            return;
        }
        this.post({
            type: 'outputDirPicked',
            outputDir: folder,
            resolvedOutputDir: folder,
        });
    }

    private async runExport(settings: ExportFormSettings): Promise<void> {
        if (this.exporting) {
            return;
        }
        const workspaceRoot = this.workspaceRoot();
        if (!workspaceRoot) {
            this.post({
                type: 'exportFinished',
                ok: false,
                message: 'Open a workspace folder before exporting requirements.',
            });
            return;
        }

        const validationError = validateSettings(settings);
        if (validationError) {
            this.post({ type: 'exportFinished', ok: false, message: validationError });
            return;
        }

        if (settings.scope === 'currentFile' && !this.activeRqDocument()) {
            this.post({
                type: 'exportFinished',
                ok: false,
                message: 'Open a .rq file to export current-file scope, or switch to workspace scope.',
            });
            return;
        }

        this.persistSettings(settings, false);
        this.exporting = true;
        this.post({ type: 'exportStarted' });

        try {
            if (!this.submodule.index.isReady) {
                await this.submodule.index.syncWorkspace();
            }
            const request = toExportRequest(settings, workspaceRoot, this.activeRqDocument());
            const result = await exportHtml(this.submodule.index.indexStore, request);
            await vscode.env.openExternal(vscode.Uri.file(result.indexFilePath));
            this.post({
                type: 'exportFinished',
                ok: true,
                message: `Exported HTML site to ${result.outputDir}`,
            });
            void vscode.window.showInformationMessage(`Exported HTML site to ${result.outputDir}`);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.post({ type: 'exportFinished', ok: false, message: detail });
            void vscode.window.showErrorMessage(`HTML export failed: ${detail}`);
        } finally {
            this.exporting = false;
        }
    }
}

function validateSettings(settings: ExportFormSettings): string | undefined {
    const name = settings.exportName.trim();
    if (!name) {
        return 'Export name is required.';
    }
    if (/[\\/]/.test(name)) {
        return 'Export name cannot contain path separators.';
    }
    if (!settings.outputDir.trim()) {
        return 'Output folder is required.';
    }
    const headerHref = settings.headerHref.trim();
    const headerLabel = settings.headerLabel.trim();
    if ((headerHref && !headerLabel) || (!headerHref && headerLabel)) {
        return 'Header link requires both href and label.';
    }
    if (!Number.isFinite(settings.maxGraphNodes) || settings.maxGraphNodes < 1) {
        return 'Max graph nodes must be a positive number.';
    }
    return undefined;
}

function toExportRequest(
    settings: ExportFormSettings,
    workspaceRoot: string,
    sourceDocument: vscode.TextDocument | undefined
): ExportRequest {
    const headerHref = settings.headerHref.trim();
    const headerLabel = settings.headerLabel.trim();
    return {
        format: 'html',
        outputDir: resolveOutputDir(workspaceRoot, settings.outputDir),
        exportName: settings.exportName.trim(),
        workspaceRoot,
        templateId: settings.templateId.trim() || 'default',
        scope: settings.scope,
        sourceFileUri: settings.scope === 'currentFile' && sourceDocument
            ? toIndexFileUri(sourceDocument.uri)
            : undefined,
        includeRequirementsPage: settings.includeRequirementsPage,
        includeGraphPage: settings.includeGraphPage,
        printEntryFileName: settings.printEntryFileName.trim() || 'print.html',
        maxGraphNodes: settings.maxGraphNodes,
        runtimeMode: settings.runtimeMode,
        clusterStrategy: settings.clusterStrategy,
        includeIdeaPages: settings.includeIdeaPages,
        includeFilePages: settings.includeFilePages,
        includeCodeFilePages: settings.includeCodeFilePages,
        includeClusterPages: settings.includeClusterPages,
        includeAttributePages: settings.includeAttributePages,
        includePrintPages: settings.includePrintPages,
        excludeSecretFiles: settings.excludeSecretFiles,
        urlBase: settings.urlBase.trim() || undefined,
        headerLink: headerHref && headerLabel
            ? { href: headerHref, label: headerLabel }
            : undefined,
    };
}

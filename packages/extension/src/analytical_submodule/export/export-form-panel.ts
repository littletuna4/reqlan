/**
 * Webview panel for multi-format export options (HTML, PDF, …).
 */
import * as vscode from 'vscode';
import { basename } from 'node:path';
import {
    exportCsv,
    exportHtml,
    exportJson,
    exportMarkdown,
    type ExportProgress,
    type ExportRequest,
    type ExportResult
} from '@reqlan/analytical';
import type { AnalyticalSubmodule } from '../index.js';
import { toIndexFileUri } from '../index-store/resolve-index-file-uri.js';
import type {
    ExportFormBaseOption,
    ExportFormToExtensionMessage,
    ExtensionToExportFormMessage
} from './export-form-messages.js';
import {
    exportSettingsPath,
    loadExportFormSettings,
    resolveOutputDir,
    saveExportFormSettings,
    type ExportFormFormat,
    type ExportFormSettings
} from './export-settings.js';
import { getExportFormHtml } from './get-export-form-html.js';
import { safeWebviewPost } from '../../shared/safe-webview-post.js';

const VIEW_TYPE = 'reqlan.exportForm';

export type ExportFormShowOptions = {
    /** Pre-select format when opening (command palette / Ideas Summary links). */
    format?: ExportFormFormat;
};

export class ExportFormPanel {
    private static current?: ExportFormPanel;

    static show(
        context: vscode.ExtensionContext,
        submodule: AnalyticalSubmodule,
        options?: ExportFormShowOptions
    ): void {
        if (ExportFormPanel.current) {
            ExportFormPanel.current.panel.reveal(vscode.ViewColumn.One);
            if (options?.format) {
                ExportFormPanel.current.pendingFormat = options.format;
            }
            ExportFormPanel.current.postInit();
            return;
        }
        ExportFormPanel.current = new ExportFormPanel(context, submodule, options?.format);
    }

    readonly panel: vscode.WebviewPanel;
    private exporting = false;
    private pendingFormat?: ExportFormFormat;
    private selectedBaseId?: string;

    private constructor(
        context: vscode.ExtensionContext,
        private readonly submodule: AnalyticalSubmodule,
        initialFormat?: ExportFormFormat
    ) {
        this.pendingFormat = initialFormat;
        this.selectedBaseId = submodule.index.getActiveBaseId();

        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            'Export',
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

    private listBaseOptions(): ExportFormBaseOption[] {
        return this.submodule.index.listBases().map(base => ({
            id: base.id,
            label: base.label,
            root: base.root,
        }));
    }

    private resolveSelectedBase() {
        const bases = this.submodule.index.listBases();
        if (bases.length === 0) {
            return undefined;
        }
        if (this.selectedBaseId) {
            const pinned = this.submodule.index.getRegistered(this.selectedBaseId);
            if (pinned) {
                return pinned;
            }
        }
        return this.submodule.index.getActiveBase();
    }

    private baseRoot(): string | undefined {
        return (
            this.resolveSelectedBase()?.descriptor.root ??
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        );
    }

    private activeRqDocument(): vscode.TextDocument | undefined {
        const active = vscode.window.activeTextEditor?.document;
        return active?.languageId === 'reqlan' ? active : undefined;
    }

    private postInit(): void {
        const base = this.resolveSelectedBase();
        const baseRoot = base?.descriptor.root ?? this.baseRoot();
        if (!baseRoot) {
            return;
        }
        this.selectedBaseId = base?.descriptor.id ?? this.selectedBaseId;

        const settings = loadExportFormSettings(baseRoot);
        if (this.pendingFormat) {
            settings.format = this.pendingFormat;
            this.pendingFormat = undefined;
        }
        const sourceDocument = this.activeRqDocument();
        const message: ExtensionToExportFormMessage = {
            type: 'init',
            payload: {
                settings,
                resolvedOutputDir: resolveOutputDir(baseRoot, settings.outputDir),
                baseRoot,
                selectedBaseId: this.selectedBaseId ?? base?.descriptor.id ?? '',
                bases: this.listBaseOptions(),
                canExportCurrentFile: Boolean(sourceDocument),
                activeRqFileName: sourceDocument ? basename(sourceDocument.uri.fsPath) : undefined,
                settingsPath: exportSettingsPath(baseRoot),
            },
        };
        safeWebviewPost(this.panel.webview, message);
    }

    private post(message: ExtensionToExportFormMessage): void {
        safeWebviewPost(this.panel.webview, message);
    }

    private async handleMessage(message: ExportFormToExtensionMessage): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        switch (message.type) {
            case 'ready':
                this.postInit();
                return;
            case 'selectBase':
                this.selectBase(message.baseId);
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

    private selectBase(baseId: string): void {
        if (!this.submodule.index.getRegistered(baseId)) {
            return;
        }
        this.selectedBaseId = baseId;
        // Align host surfaces with the base being exported (pointer swap + catch-up).
        this.submodule.index.setActiveBaseId(baseId);
        this.postInit();
    }

    private persistSettings(settings: ExportFormSettings, notify: boolean): boolean {
        const baseRoot = this.baseRoot();
        if (!baseRoot) {
            if (notify) {
                this.post({
                    type: 'settingsSaved',
                    ok: false,
                    message: 'Create or select a reqlan base before saving export settings.',
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
            saveExportFormSettings(baseRoot, settings);
            if (notify) {
                this.post({
                    type: 'settingsSaved',
                    ok: true,
                    message: `Saved to ${exportSettingsPath(baseRoot)}`,
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
        const baseRoot = this.baseRoot();
        if (!baseRoot) {
            return;
        }
        const defaultUri = vscode.Uri.file(resolveOutputDir(baseRoot, currentOutputDir));
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
        const base = this.resolveSelectedBase();
        const baseRoot = base?.descriptor.root ?? this.baseRoot();
        if (!base || !baseRoot) {
            this.post({
                type: 'exportFinished',
                ok: false,
                message: 'Create or select a reqlan base before exporting requirements.',
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
                message: 'Open a .rq file to export current-file scope, or switch to base scope.',
            });
            return;
        }

        this.persistSettings(settings, false);
        this.exporting = true;
        this.post({ type: 'exportStarted' });
        this.post({
            type: 'exportProgress',
            phase: 'prepare',
            message: 'Preparing export…',
        });

        try {
            if (this.selectedBaseId && this.selectedBaseId !== this.submodule.index.getActiveBaseId()) {
                this.submodule.index.setActiveBaseId(this.selectedBaseId);
            }
            if (!base.index.isReady) {
                this.post({
                    type: 'exportProgress',
                    phase: 'prepare',
                    message: 'Syncing base index…',
                });
                await base.index.ensureReady();
            }
            const request = toExportRequest(settings, baseRoot, this.activeRqDocument());
            const onProgress = (progress: ExportProgress) => {
                this.post({
                    type: 'exportProgress',
                    phase: progress.phase,
                    message: progress.message,
                    completed: progress.completed,
                    total: progress.total,
                });
            };
            const result = await runExport(settings.format, base.index.indexStore, request, onProgress);
            if (settings.format === 'json' || settings.format === 'csv') {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.indexFilePath));
                await vscode.window.showTextDocument(doc, { preview: false });
            } else {
                const landingFile = settings.format === 'pdf' ? result.printFilePath : result.indexFilePath;
                await vscode.env.openExternal(vscode.Uri.file(landingFile));
            }
            const doneMessage = formatDoneMessage(settings.format, result.outputDir, result.printFilePath, result.indexFilePath);
            this.post({
                type: 'exportFinished',
                ok: true,
                message: doneMessage,
            });
            void vscode.window.showInformationMessage(doneMessage);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            const label = formatLabel(settings.format);
            this.post({ type: 'exportFinished', ok: false, message: detail });
            void vscode.window.showErrorMessage(`${label} failed: ${detail}`);
        } finally {
            this.exporting = false;
        }
    }
}

async function runExport(
    format: ExportFormSettings['format'],
    store: Parameters<typeof exportHtml>[0],
    request: ExportRequest,
    onProgress: (progress: ExportProgress) => void
): Promise<ExportResult> {
    switch (format) {
        case 'markdown':
            return exportMarkdown(store, request, onProgress);
        case 'json':
            return exportJson(store, request, onProgress);
        case 'csv':
            return exportCsv(store, request, onProgress);
        default:
            return exportHtml(store, request, onProgress);
    }
}

function formatLabel(format: ExportFormSettings['format']): string {
    switch (format) {
        case 'pdf':
            return 'PDF export';
        case 'markdown':
            return 'Markdown export';
        case 'json':
            return 'JSON export';
        case 'csv':
            return 'CSV export';
        default:
            return 'HTML export';
    }
}

function formatDoneMessage(
    format: ExportFormSettings['format'],
    outputDir: string,
    printFilePath: string,
    indexFilePath: string
): string {
    switch (format) {
        case 'pdf':
            return `Prepared printable HTML at ${printFilePath}. Use your browser’s Print → Save as PDF to finish.`;
        case 'markdown':
            return `Exported markdown to ${outputDir}`;
        case 'json':
            return `Exported JSON to ${indexFilePath}`;
        case 'csv':
            return `Exported CSV to ${outputDir}`;
        default:
            return `Exported HTML site to ${outputDir}`;
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
    if (settings.format === 'html') {
        const headerHref = settings.headerHref.trim();
        const headerLabel = settings.headerLabel.trim();
        if ((headerHref && !headerLabel) || (!headerHref && headerLabel)) {
            return 'Header link requires both href and label.';
        }
        if (!Number.isFinite(settings.maxGraphNodes) || settings.maxGraphNodes < 1) {
            return 'Max graph nodes must be a positive number.';
        }
    }
    return undefined;
}

function toExportRequest(
    settings: ExportFormSettings,
    baseRoot: string,
    sourceDocument: vscode.TextDocument | undefined
): ExportRequest {
    const isPdf = settings.format === 'pdf';
    const isLean = settings.format === 'markdown'
        || settings.format === 'json'
        || settings.format === 'csv';
    const headerHref = settings.headerHref.trim();
    const headerLabel = settings.headerLabel.trim();
    return {
        format: settings.format,
        outputDir: resolveOutputDir(baseRoot, settings.outputDir),
        exportName: settings.exportName.trim(),
        workspaceRoot: baseRoot,
        templateId: settings.templateId.trim() || 'default',
        scope: settings.scope,
        sourceFileUri: settings.scope === 'currentFile' && sourceDocument
            ? toIndexFileUri(sourceDocument.uri)
            : undefined,
        includeRequirementsPage: isPdf || isLean ? false : settings.includeRequirementsPage,
        includeGraphPage: isPdf || isLean ? false : settings.includeGraphPage,
        printEntryFileName: settings.printEntryFileName.trim() || 'print.html',
        maxGraphNodes: settings.maxGraphNodes,
        runtimeMode: isPdf ? 'print' : isLean ? 'document' : settings.runtimeMode,
        clusterStrategy: settings.clusterStrategy,
        includeIdeaPages: settings.format === 'markdown' ? settings.includeIdeaPages : (isPdf || isLean ? false : settings.includeIdeaPages),
        includeFilePages: isPdf || isLean ? false : settings.includeFilePages,
        includeCodeFilePages: isPdf || isLean ? false : settings.includeCodeFilePages,
        includeClusterPages: isPdf || settings.format === 'markdown' ? false : settings.includeClusterPages,
        includeAttributePages: isPdf || settings.format === 'markdown' ? false : settings.includeAttributePages,
        includePrintPages: isLean ? false : true,
        excludeSecretFiles: settings.excludeSecretFiles,
        excludeIgnoredFiles: settings.excludeIgnoredFiles,
        urlBase: isPdf || isLean ? undefined : (settings.urlBase.trim() || undefined),
        headerLink: !isPdf && !isLean && headerHref && headerLabel
            ? { href: headerHref, label: headerLabel }
            : undefined,
    };
}

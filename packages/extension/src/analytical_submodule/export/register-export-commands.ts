import * as vscode from 'vscode';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { FileSystemProvider } from 'langium';
import { URI } from 'langium';
import {
    exportHtml,
    type ExportFormat,
    type ExportRequest
} from '@reqlan/analytical';
import { loadApplyingRqConfig, type RqExportConfig } from '@reqlan/language';
import type { AnalyticalSubmodule } from '../index.js';
import { toIndexFileUri } from '../index-store/resolve-index-file-uri.js';
import { ExportFormPanel } from './export-form-panel.js';

export function registerExportCommands(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.exportHtml', () => {
            ExportFormPanel.show(context, submodule);
        }),
        vscode.commands.registerCommand('reqlan.exportPdf', async () => {
            await exportRequirements('pdf', submodule);
        })
    );
}

async function waitForIndex(index: AnalyticalSubmodule['index']): Promise<void> {
    if (index.isReady) {
        return;
    }
    await index.syncWorkspace();
}

async function exportRequirements(
    format: ExportFormat,
    submodule: AnalyticalSubmodule
): Promise<void> {
    await waitForIndex(submodule.index);
    const workspaceRoot =
        submodule.index.getActiveBase()?.descriptor.root ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage('Open a workspace folder before exporting requirements.');
        return;
    }

    const request = await promptForExportRequest(format, workspaceRoot);
    if (!request) {
        return;
    }

    const result = await exportHtml(submodule.index.indexStore, request);
    const landingFile = format === 'html' ? result.indexFilePath : result.printFilePath;
    await vscode.env.openExternal(vscode.Uri.file(landingFile));

    const message = format === 'html'
        ? `Exported HTML site to ${result.outputDir}`
        : `Prepared printable HTML at ${result.printFilePath}. Direct PDF rendering is not implemented yet.`;
    void vscode.window.showInformationMessage(message);
}

async function promptForExportRequest(
    format: ExportFormat,
    workspaceRoot: string
): Promise<ExportRequest | undefined> {
    const activeEditor = vscode.window.activeTextEditor;
    const sourceDocument = activeEditor?.document.languageId === 'reqlan'
        ? activeEditor.document
        : undefined;
    const exportConfig = loadExportConfig(sourceDocument?.uri.fsPath ?? workspaceRoot);
    const defaultScope = sourceDocument && exportConfig.scope === 'currentFile'
        ? 'currentFile'
        : 'workspace';
    const scope = await promptForExportScope(defaultScope, Boolean(sourceDocument));
    if (!scope) {
        return undefined;
    }

    const outputRoot = await promptForOutputFolder(workspaceRoot, exportConfig);
    if (!outputRoot) {
        return undefined;
    }

    const templateId = await promptForTemplate(exportConfig);
    if (!templateId) {
        return undefined;
    }

    const runtimeMode = await promptForRuntimeMode(exportConfig);
    if (!runtimeMode) {
        return undefined;
    }

    const clusterStrategy = await promptForClusterStrategy(exportConfig);
    if (!clusterStrategy) {
        return undefined;
    }

    const defaultName = defaultExportName(scope, sourceDocument?.uri);
    const exportName = await vscode.window.showInputBox({
        prompt: `Folder name for the ${format.toUpperCase()} export`,
        value: defaultName,
        validateInput: value => {
            const trimmed = value.trim();
            if (trimmed.length === 0) {
                return 'Export name is required';
            }
            return /[\\/]/.test(trimmed) ? 'Export name cannot contain path separators' : undefined;
        }
    });
    if (!exportName) {
        return undefined;
    }

    return {
        format,
        outputDir: outputRoot,
        exportName: exportName.trim(),
        workspaceRoot,
        templateId,
        scope,
        sourceFileUri: scope === 'currentFile' && sourceDocument ? toIndexFileUri(sourceDocument.uri) : undefined,
        includeRequirementsPage: exportConfig.html?.includeRequirementsPage ?? true,
        includeGraphPage: exportConfig.html?.includeGraphPage ?? true,
        printEntryFileName: exportConfig.html?.printEntryFileName ?? 'print.html',
        // Neighbourhood graphs on idea/file/cluster pages; workspace graph.html sizes to the export idea count.
        maxGraphNodes: 120,
        runtimeMode,
        clusterStrategy,
        includeIdeaPages: exportConfig.html?.includeIdeaPages ?? true,
        includeFilePages: exportConfig.html?.includeFilePages ?? true,
        includeCodeFilePages: exportConfig.html?.includeCodeFilePages ?? true,
        includeClusterPages: exportConfig.html?.includeClusterPages ?? true,
        includeAttributePages: exportConfig.html?.includeAttributePages ?? true,
        includePrintPages: exportConfig.html?.includePrintPages ?? true
    };
}

async function promptForExportScope(
    defaultScope: 'workspace' | 'currentFile',
    canExportCurrentFile: boolean
): Promise<'workspace' | 'currentFile' | undefined> {
    const items: Array<vscode.QuickPickItem & { scope: 'workspace' | 'currentFile' }> = [
        {
            label: 'Workspace',
            description: 'Export the indexed workspace graph',
            scope: 'workspace'
        }
    ];
    if (canExportCurrentFile) {
        items.push({
            label: 'Current file',
            description: 'Export the active .rq file and its local graph',
            scope: 'currentFile'
        });
    }

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Choose export scope${defaultScope === 'currentFile' ? ' (default: current file)' : ' (default: workspace)'}`
    });
    return picked?.scope;
}

async function promptForOutputFolder(
    workspaceRoot: string,
    exportConfig: RqExportConfig
): Promise<string | undefined> {
    const defaultOutputRoot = exportConfig.outputFolder ?? join(workspaceRoot, 'reqlan-export');
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(defaultOutputRoot),
        openLabel: 'Select export folder'
    });
    return picked?.[0]?.fsPath;
}

async function promptForTemplate(exportConfig: RqExportConfig): Promise<string | undefined> {
    const defaultTemplateId = exportConfig.templateId ?? 'default';
    const items = [{
        label: 'Default',
        description: 'Multi-page HTML export template',
        detail: 'Overview, ideas, files, clusters, graph, search, and printable pages',
        templateId: 'default'
    }];
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Choose export template (default: ${defaultTemplateId})`
    });
    return picked?.templateId;
}

async function promptForRuntimeMode(exportConfig: RqExportConfig): Promise<'interactive' | 'document' | 'print' | undefined> {
    const defaultRuntimeMode = exportConfig.html?.runtimeMode ?? 'interactive';
    const items: Array<vscode.QuickPickItem & { runtimeMode: 'interactive' | 'document' | 'print' }> = [
        {
            label: 'Interactive',
            description: 'Rich static site with search and graph navigation',
            runtimeMode: 'interactive'
        },
        {
            label: 'Document',
            description: 'Lean document-focused HTML pages',
            runtimeMode: 'document'
        },
        {
            label: 'Print',
            description: 'Printable-first output with simpler navigation',
            runtimeMode: 'print'
        }
    ];
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Choose HTML runtime mode (default: ${defaultRuntimeMode})`
    });
    return picked?.runtimeMode;
}

async function promptForClusterStrategy(exportConfig: RqExportConfig): Promise<'deterministic' | 'hybrid' | undefined> {
    const defaultStrategy = exportConfig.html?.clusterStrategy ?? 'hybrid';
    const items: Array<vscode.QuickPickItem & { clusterStrategy: 'deterministic' | 'hybrid' }> = [
        {
            label: 'Hybrid',
            description: 'Deterministic clusters plus computed communities',
            clusterStrategy: 'hybrid'
        },
        {
            label: 'Deterministic',
            description: 'File, folder, tag, and status clusters only',
            clusterStrategy: 'deterministic'
        }
    ];
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Choose cluster strategy (default: ${defaultStrategy})`
    });
    return picked?.clusterStrategy;
}

function defaultExportName(
    scope: 'workspace' | 'currentFile',
    sourceUri: vscode.Uri | undefined
): string {
    if (scope === 'currentFile' && sourceUri) {
        return `${basename(sourceUri.fsPath, '.rq')}-export`;
    }
    return 'reqlan-export';
}

function loadExportConfig(startPath: string): RqExportConfig {
    const startDir = existsSync(startPath) && statSync(startPath).isDirectory()
        ? startPath
        : dirname(startPath);
    const config = loadApplyingRqConfig(
        URI.file(startDir),
        nodeConfigFs
    );
    return config?.export ?? {};
}

const nodeConfigFs: FileSystemProvider = {
    readFile(uri: URI) {
        throw new Error(`Async read is not implemented for config load: ${uri.toString()}`);
    },
    readFileSync(uri: URI) {
        return readFileSync(uri.fsPath, 'utf8');
    },
    exists(uri: URI) {
        return Promise.resolve(existsSync(uri.fsPath));
    },
    existsSync(uri: URI) {
        return existsSync(uri.fsPath);
    },
    stat(uri: URI) {
        const stats = statSync(uri.fsPath);
        return Promise.resolve({
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            isSymbolicLink: stats.isSymbolicLink(),
            size: stats.size,
            mtime: stats.mtimeMs,
            ctime: stats.ctimeMs
        });
    },
    statSync(uri: URI) {
        const stats = statSync(uri.fsPath);
        return {
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            isSymbolicLink: stats.isSymbolicLink(),
            size: stats.size,
            mtime: stats.mtimeMs,
            ctime: stats.ctimeMs
        };
    },
    readDirectory(_uri: URI) {
        throw new Error('Directory reads are not implemented for config load.');
    },
    readBinary(_uri: URI) {
        throw new Error('Binary reads are not implemented for config load.');
    },
    readBinarySync(_uri: URI) {
        throw new Error('Binary reads are not implemented for config load.');
    },
    readDirectorySync(_uri: URI) {
        throw new Error('Directory reads are not implemented for config load.');
    }
} as unknown as FileSystemProvider;

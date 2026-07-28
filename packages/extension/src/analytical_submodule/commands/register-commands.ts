import * as vscode from 'vscode';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { FileSystemProvider } from 'langium';
import { URI } from 'langium';
import type {
    CompletionSummary,
    DeprecationImpact,
    ExportFormat,
    ExportRequest,
    FileRelatedRequirements,
    GraphSlice,
    IdeaSummary,
    SemanticMatch
} from 'reqlan-analytical';
import type { AnalyticalSubmodule } from '../index.js';
import { openIndexFile } from '../index-store/open-index-file.js';
import { toIndexFileUri } from '../index-store/resolve-index-file-uri.js';
import { buildExportSnapshot, writeHtmlExport } from 'reqlan-analytical';
import { loadApplyingRqConfig, type RqExportConfig } from 'reqlan-language';

export function registerAnalyticalCommands(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const { index, analysers } = submodule;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const makeContext = () => ({
        store: index.indexStore,
        analytical: submodule.store,
        workspaceRoot
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.listAllIdeas', async () => {
            await waitForIndex(index);
            const ideas = await analysers.run<void, IdeaSummary[]>(makeContext(), 'list_all_ideas', undefined);
            const items = ideas.map(idea => ({
                label: idea.name,
                description: vscode.workspace.asRelativePath(idea.fileUri),
                detail: idea.summary,
                idea
            }));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'All ideas in workspace',
                matchOnDescription: true,
                matchOnDetail: true
            });
            if (picked) {
                await openIndexFile(picked.idea.fileUri, picked.idea.lineStart);
            }
        }),

        vscode.commands.registerCommand('reqlan.fileRelatedRequirements', async () => {
            await waitForIndex(index);
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                void vscode.window.showWarningMessage('Open a file to find related requirements.');
                return;
            }
            const result = await analysers.run<{ fileUri: string }, FileRelatedRequirements>(
                makeContext(),
                'file_related_requirements',
                { fileUri: toIndexFileUri(editor.document.uri) }
            );
            const items = [
                ...result.ideasInFile.map(idea => ({ label: `[in file] ${idea.name}`, idea })),
                ...result.referencingIdeas.map(idea => ({ label: `[references] ${idea.name}`, idea })),
                ...result.commentLinkedIdeas.map(idea => ({ label: `[comment link] ${idea.name}`, idea }))
            ];
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Requirements related to current file'
            });
            if (picked) {
                await openIndexFile(picked.idea.fileUri, picked.idea.lineStart);
            }
        }),

        vscode.commands.registerCommand('reqlan.deprecationImpact', async () => {
            await waitForIndex(index);
            const impacts = await analysers.run<void, DeprecationImpact[]>(
                makeContext(),
                'deprecation_impact_analysis',
                undefined
            );
            if (impacts.length === 0) {
                void vscode.window.showInformationMessage('No deprecated ideas found.');
                return;
            }
            const items = impacts.flatMap(impact =>
                impact.dependents.map(dep => ({
                    label: dep.name,
                    description: `depends on deprecated: ${impact.deprecated.name}`,
                    idea: dep
                }))
            );
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Downstream impact of deprecated ideas'
            });
            if (picked) {
                await openIndexFile(picked.idea.fileUri, picked.idea.lineStart);
            }
        }),

        vscode.commands.registerCommand('reqlan.completionStatus', async () => {
            await waitForIndex(index);
            const summary = await analysers.run<void, CompletionSummary>(
                makeContext(),
                'completion_tracking',
                undefined
            );
            const message = [
                `Total ideas: ${summary.total}`,
                `Outstanding: ${summary.outstanding.length}`,
                `Deprecated: ${summary.deprecated.length}`,
                `Statuses: ${Object.entries(summary.byStatus).map(([k, v]) => `${k}=${v}`).join(', ')}`
            ].join(' | ');
            void vscode.window.showInformationMessage(message);
        }),

        vscode.commands.registerCommand('reqlan.getLocalGraph', async () => {
            await waitForIndex(index);
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'reqlan') {
                void vscode.window.showWarningMessage('Open a reqlan file to inspect its local graph.');
                return;
            }
            const ideas = await index.indexStore.getIdeasInFile(toIndexFileUri(editor.document.uri));
            if (ideas.length === 0) {
                void vscode.window.showInformationMessage('No ideas found in the current file.');
                return;
            }
            const center = ideas[0]!;
            const graph = await analysers.run<{ centerId: string; depth?: number }, GraphSlice>(
                makeContext(),
                'local_graph_analysis',
                { centerId: center.id, depth: 1 }
            );
            const panel = vscode.window.createWebviewPanel(
                'reqlanLocalGraph',
                `Local graph: ${center.name}`,
                vscode.ViewColumn.Beside,
                { enableScripts: false }
            );
            panel.webview.html = renderGraphHtml(graph.nodes, graph.edges);
        }),

        vscode.commands.registerCommand('reqlan.semanticSearch', async () => {
            await waitForIndex(index);
            const query = await vscode.window.showInputBox({
                prompt: 'Search ideas by name, summary, tags, or references'
            });
            if (!query) {
                return;
            }
            const matches = await analysers.run<{ query: string }, SemanticMatch[]>(
                makeContext(),
                'semantic_analysis',
                { query }
            );
            const items = matches.map(match => ({
                label: match.idea.name,
                description: `score ${match.score}`,
                detail: `${match.reasons.join(', ')} — ${match.idea.summary}`,
                idea: match.idea
            }));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: `Semantic matches for "${query}"`
            });
            if (picked) {
                await openIndexFile(picked.idea.fileUri, picked.idea.lineStart);
            }
        }),

        vscode.commands.registerCommand('reqlan.refreshIndex', async () => {
            await index.syncWorkspace();
            void vscode.window.showInformationMessage('Reqlan idea index refreshed.');
        }),

        vscode.commands.registerCommand('reqlan.exportHtml', async () => {
            await exportRequirements('html', submodule);
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

function renderGraphHtml(
    nodes: Array<{ id: string; name: string; kind: string }>,
    edges: Array<{ sourceId: string; targetId?: string; kind: string; label?: string }>
): string {
    const nodeRows = nodes.map(node => `<li><strong>${escapeHtml(node.name)}</strong> (${escapeHtml(node.kind)})</li>`).join('');
    const edgeRows = edges.map(edge =>
        `<li>${escapeHtml(edge.kind)}: ${escapeHtml(edge.sourceId)} → ${escapeHtml(edge.targetId ?? edge.label ?? '?')}</li>`
    ).join('');
    return `<!DOCTYPE html>
<html><body>
  <h2>Local graph</h2>
  <h3>Nodes (${nodes.length})</h3>
  <ul>${nodeRows}</ul>
  <h3>Edges (${edges.length})</h3>
  <ul>${edgeRows}</ul>
</body></html>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function exportRequirements(
    format: ExportFormat,
    submodule: AnalyticalSubmodule
): Promise<void> {
    await waitForIndex(submodule.index);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        void vscode.window.showWarningMessage('Open a workspace folder before exporting requirements.');
        return;
    }

    const request = await promptForExportRequest(format, workspaceRoot);
    if (!request) {
        return;
    }

    const snapshot = await buildExportSnapshot(submodule.index.indexStore, request);
    const result = await writeHtmlExport(snapshot, request);
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
        maxGraphNodes: 120,
        runtimeMode,
        clusterStrategy,
        includeIdeaPages: exportConfig.html?.includeIdeaPages ?? true,
        includeFilePages: exportConfig.html?.includeFilePages ?? true,
        includeClusterPages: exportConfig.html?.includeClusterPages ?? true,
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

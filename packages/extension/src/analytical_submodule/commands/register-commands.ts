import * as vscode from 'vscode';
import type {
    CompletionSummary,
    DeprecationImpact,
    FileRelatedRequirements,
    GraphSlice,
    IdeaSummary,
    SemanticMatch
} from 'reqlan-analytical';
import type { AnalyticalSubmodule } from '../index.js';
import { openIndexFile } from '../index-store/open-index-file.js';
import { toIndexFileUri } from '../index-store/resolve-index-file-uri.js';

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

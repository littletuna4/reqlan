import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../index.js';
import { openIndexFile } from '../index-store/open-index-file.js';
import { registerExportCommands } from '../export/register-export-commands.js';

export function registerAnalyticalCommands(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const { index } = submodule;

    registerExportCommands(context, submodule);

    const openIdeaHit = (fileUri: string, line: number) =>
        openIndexFile(fileUri, line, 0, index.getActiveBase()?.descriptor.root);

    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.createBase', async () => {
            const created = await index.createBase();
            if (created) {
                void vscode.window.showInformationMessage(`Created reqlan base at ${created.label}`);
            }
        }),

        vscode.commands.registerCommand('reqlan.listAllIdeas', async () => {
            await waitForIndex(index);
            const ideas = await (await index.getAnalysisApi()).listRequirements(0xffff_ffff);
            const items = ideas.map(idea => ({
                label: idea.name,
                description: vscode.workspace.asRelativePath(idea.fileUri),
                detail: idea.summary,
                idea
            }));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'All ideas in active base',
                matchOnDescription: true,
                matchOnDetail: true
            });
            if (picked) {
                await openIdeaHit(picked.idea.fileUri, picked.idea.lineStart);
            }
        }),

        vscode.commands.registerCommand('reqlan.fileRelatedRequirements', async () => {
            await waitForIndex(index);
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                void vscode.window.showWarningMessage('Open a file to find related requirements.');
                return;
            }
            index.activateBaseForPath(editor.document.uri.fsPath);
            const result = await (await index.getAnalysisApi()).getFileContext(editor.document.uri.fsPath);
            const items = [
                ...result.ideasInFile.map(idea => ({ label: `[in file] ${idea.name}`, idea })),
                ...result.referencingIdeas.map(idea => ({ label: `[references] ${idea.name}`, idea })),
                ...result.commentLinkedIdeas.map(idea => ({ label: `[comment link] ${idea.name}`, idea }))
            ];
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Requirements related to current file'
            });
            if (picked) {
                await openIdeaHit(picked.idea.fileUri, picked.idea.lineStart);
            }
        }),

        vscode.commands.registerCommand('reqlan.deprecationImpact', async () => {
            await waitForIndex(index);
            const impacts = await (await index.getAnalysisApi()).getDeprecationImpact();
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
                await openIdeaHit(picked.idea.fileUri, picked.idea.lineStart);
            }
        }),

        vscode.commands.registerCommand('reqlan.completionStatus', async () => {
            await waitForIndex(index);
            const summary = await (await index.getAnalysisApi()).getCompletionStatus();
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
            index.activateBaseForPath(editor.document.uri.fsPath);
            const graph = await (await index.getAnalysisApi()).getLocalGraph(editor.document.uri.fsPath, 1);
            if (!graph) {
                void vscode.window.showInformationMessage('No ideas found in the current file.');
                return;
            }
            const center = graph.nodes.find(idea => idea.id === graph.centerId) ?? graph.nodes[0];
            const panel = vscode.window.createWebviewPanel(
                'reqlanLocalGraph',
                `Local graph: ${center?.name ?? 'current file'}`,
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
            const matches = await (await index.getAnalysisApi()).searchRequirements(query, 8);
            const items = matches.map(match => ({
                label: match.idea.name,
                description: `score ${match.score ?? 0}`,
                detail: `${(match.reasons ?? []).join(', ')} — ${match.idea.summary}`,
                idea: match.idea
            }));
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: `Semantic matches for "${query}"`
            });
            if (picked) {
                await openIdeaHit(picked.idea.fileUri, picked.idea.lineStart);
            }
        }),

        vscode.commands.registerCommand('reqlan.refreshIndex', async () => {
            await index.syncWorkspace();
            void vscode.window.showInformationMessage('Reqlan idea index refreshed.');
        })
    );
}

async function waitForIndex(index: AnalyticalSubmodule['index']): Promise<void> {
    if (index.discoveryEmpty) {
        await index.promptCreateBaseIfNeeded();
        if (index.discoveryEmpty) {
            throw new Error('No reqlan base found. Run "Reqlan: Create Base" first.');
        }
    }
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

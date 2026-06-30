import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { ActivityBarProvider } from './activity-bar-provider.js';

export function registerActivityBarModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const makeContext = () => ({
        store: submodule.index.indexStore,
        analytical: submodule.store,
        workspaceRoot
    });
    const provider = new ActivityBarProvider(submodule.index, submodule.analysers, makeContext);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('reqlan.activityBar', provider),
        vscode.window.onDidChangeActiveTextEditor(() => provider.refresh()),
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor.document.languageId === 'reqlan') {
                provider.refresh();
            }
        }),
        vscode.commands.registerCommand('reqlan.refreshActivityBar', () => {
            provider.refresh();
        }),
        vscode.commands.registerCommand('reqlan.openIdeaFromActivityBar', async (fileUri: string, line: number) => {
            const uri = vscode.Uri.parse(fileUri);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        })
    );

    provider.refresh();
}

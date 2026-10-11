/**
 * rq:["../../../../../reqlan rq/cli/diff.rq".diff_webview]
 * rq:["../../../../../reqlan rq/extension/host/features-commands.rq".command_palette]
 */
import * as vscode from 'vscode';
import { DiffPanel } from './diff-panel.js';

export function registerDiffModule(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.diffIdeas', () => {
            DiffPanel.show(context);
        })
    );
}

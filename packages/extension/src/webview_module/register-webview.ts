import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { IdeasSummaryPanel } from './ideas-summary-panel.js';

export function registerWebviewModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.openIdeasSummary', () => {
            IdeasSummaryPanel.show(context, submodule);
        })
    );
}

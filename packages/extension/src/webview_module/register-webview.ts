import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { IdeasSummaryPanel } from './ideas-summary-panel.js';

export function registerWebviewModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const activationGeneration = IdeasSummaryPanel.bumpActivationGeneration();
    IdeasSummaryPanel.forceDispose();

    context.subscriptions.push(
        {
            dispose: () => IdeasSummaryPanel.forceDispose()
        },
        vscode.commands.registerCommand('reqlan.openIdeasSummary', () => {
            IdeasSummaryPanel.show(context, submodule, activationGeneration);
        })
    );
}

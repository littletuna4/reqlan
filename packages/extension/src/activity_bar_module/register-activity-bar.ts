import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { IdeasSummaryPanel } from '../webview_module/ideas-summary-panel.js';
import { registerActivityBarWebview } from './activity-bar-webview-provider.js';

export function registerActivityBarModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const activationGeneration = IdeasSummaryPanel.bumpActivationGeneration();
    registerActivityBarWebview(context, submodule, activationGeneration);
}

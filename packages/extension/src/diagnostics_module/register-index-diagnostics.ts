/**
 * rq:["../../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_webview]
 */
import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { IndexDiagnosticsPanel } from './index-diagnostics-panel.js';

export function registerIndexDiagnosticsModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.openIndexDiagnostics', () => {
            IndexDiagnosticsPanel.show(context, submodule);
        })
    );
}

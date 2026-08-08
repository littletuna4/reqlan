import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../index.js';
import { ExportFormPanel, type ExportFormShowOptions } from './export-form-panel.js';

export function registerExportCommands(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const show = (options?: ExportFormShowOptions) => {
        ExportFormPanel.show(context, submodule, options);
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.exportHtml', () => {
            show({ format: 'html' });
        }),
        vscode.commands.registerCommand('reqlan.exportMarkdown', () => {
            show({ format: 'markdown' });
        }),
        vscode.commands.registerCommand('reqlan.exportJson', () => {
            show({ format: 'json' });
        }),
        vscode.commands.registerCommand('reqlan.exportCsv', () => {
            show({ format: 'csv' });
        }),
        vscode.commands.registerCommand('reqlan.exportPdf', () => {
            show({ format: 'pdf' });
        })
    );
}

import * as vscode from 'vscode';
import { ideaId } from '@reqlan/analytical';
import {
    REQLAN_INBOUND_FILE_REFERENCES_SUMMARY_COMMAND,
    REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND
} from '@reqlan/language';
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
        }),
        vscode.commands.registerCommand(
            REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND,
            (fileUri: string, ideaName: string) => {
                const targetId = ideaId(fileUri, ideaName);
                IdeasSummaryPanel.show(context, submodule, activationGeneration, {
                    activeTab: 'ideas',
                    referenceFilters: [{
                        direction: 'outbound',
                        filterKey: `outbound:idea:${targetId}`,
                        label: ideaName
                    }]
                });
            }
        ),
        vscode.commands.registerCommand(
            REQLAN_INBOUND_FILE_REFERENCES_SUMMARY_COMMAND,
            (documentUri: string, indexedUri: string) => {
                const target = indexedUri || documentUri;
                const label = fileLabelFromIndexedUri(target);
                IdeasSummaryPanel.show(context, submodule, activationGeneration, {
                    activeTab: 'ideas',
                    referenceFilters: [{
                        direction: 'outbound',
                        filterKey: `outbound:file:${target}`,
                        label
                    }]
                });
            }
        )
    );
}

function fileLabelFromIndexedUri(uri: string): string {
    const normalized = uri.replace(/\\/g, '/');
    const slash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

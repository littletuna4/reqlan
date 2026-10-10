/**
 * Command palette toggle for reference inlay hints in .rq editors.
 * When the language client is running, push the setting to reqlan-lsp.
 */
import * as vscode from 'vscode';
import { REQLAN_REFERENCE_INLAY_HINTS_SETTING } from '@reqlan/language';
import type { LanguageClient } from 'vscode-languageclient/node';
import { pushIdeaContentTooltip } from './idea-content-tooltip.js';

export function registerReferenceInlayHintsToggle(
    context: vscode.ExtensionContext,
    getClient: () => LanguageClient | undefined = () => undefined
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.toggleReferenceInlayHints', async () => {
            const config = vscode.workspace.getConfiguration('reqlan');
            const current = config.get<boolean>(`${REQLAN_REFERENCE_INLAY_HINTS_SETTING}.enabled`, false);
            const next = !current;
            await config.update(`${REQLAN_REFERENCE_INLAY_HINTS_SETTING}.enabled`, next, vscode.ConfigurationTarget.Global);
            const client = getClient();
            if (client) {
                pushIdeaContentTooltip(client, vscode.workspace.getConfiguration('reqlan'));
            }
            void vscode.window.showInformationMessage(
                next ? 'Inbound reference inlay hints enabled.' : 'Inbound reference inlay hints disabled.'
            );
        })
    );
}

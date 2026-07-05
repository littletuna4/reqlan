/**
 * Command palette toggle for reference inlay hints in .rq editors.
 */
import * as vscode from 'vscode';
import { REQLAN_REFERENCE_INLAY_HINTS_SETTING } from 'reqlan-language';

export function registerReferenceInlayHintsToggle(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.toggleReferenceInlayHints', async () => {
            const config = vscode.workspace.getConfiguration('reqlan');
            const current = config.get<boolean>(`${REQLAN_REFERENCE_INLAY_HINTS_SETTING}.enabled`, false);
            const next = !current;
            await config.update(`${REQLAN_REFERENCE_INLAY_HINTS_SETTING}.enabled`, next, vscode.ConfigurationTarget.Global);
            void vscode.window.showInformationMessage(
                next ? 'Inbound reference inlay hints enabled.' : 'Inbound reference inlay hints disabled.'
            );
        })
    );
}

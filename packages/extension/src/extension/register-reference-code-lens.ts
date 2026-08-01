/**
 * Command palette toggle and card opener for reference classification CodeLens.
 * References already navigate as editor links; CodeLens opens an info card instead.
 */
import * as vscode from 'vscode';
import {
    REQLAN_OPEN_REFERENCE_CODE_LENS_COMMAND,
    REQLAN_REFERENCE_CODE_LENS_SETTING,
    REQLAN_TOGGLE_REFERENCE_CODE_LENS_COMMAND,
    type ReferenceCodeLensPayload
} from '@reqlan/language';
import { ReferenceCodeLensCard } from './reference-code-lens-card.js';

export function registerReferenceCodeLens(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(REQLAN_TOGGLE_REFERENCE_CODE_LENS_COMMAND, async () => {
            const config = vscode.workspace.getConfiguration('reqlan');
            const current = config.get<boolean>(`${REQLAN_REFERENCE_CODE_LENS_SETTING}.enabled`, false);
            const next = !current;
            await config.update(
                `${REQLAN_REFERENCE_CODE_LENS_SETTING}.enabled`,
                next,
                vscode.ConfigurationTarget.Global
            );
            void vscode.window.showInformationMessage(
                next ? 'Reference CodeLens enabled.' : 'Reference CodeLens disabled.'
            );
        }),
        vscode.commands.registerCommand(
            REQLAN_OPEN_REFERENCE_CODE_LENS_COMMAND,
            (payload: ReferenceCodeLensPayload | undefined) => {
                if (!payload?.targetUri || !payload.classification) {
                    return;
                }
                ReferenceCodeLensCard.show({
                    ...payload,
                    stats: payload.stats ?? []
                });
            }
        )
    );
}

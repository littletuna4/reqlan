/**
 * Command palette toggle for reference inlay hints, and open handlers for inlay clicks.
 * Inlay referencer names use `reqlan.openInboundReferencer` → openIndexFile (not raw Location).
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".traceable_inlay_hints]
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
 */
import * as vscode from 'vscode';
import {
    REQLAN_OPEN_INBOUND_REFERENCER_COMMAND,
    REQLAN_REFERENCE_INLAY_HINTS_SETTING
} from '@reqlan/language';
import type { LanguageClient } from 'vscode-languageclient/node';
import { openIndexFile } from '../analytical_submodule/index-store/open-index-file.js';
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
        }),
        vscode.commands.registerCommand(
            REQLAN_OPEN_INBOUND_REFERENCER_COMMAND,
            async (fileUri: unknown, line: unknown) => {
                if (typeof fileUri !== 'string' || fileUri.length === 0) {
                    return;
                }
                const lineNumber = typeof line === 'number' && Number.isFinite(line) ? Math.max(0, line) : 0;
                await openIndexFile(fileUri, lineNumber, 0);
            }
        )
    );
}

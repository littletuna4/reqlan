/**
 * Open wildcard-matches webview (stats + requirements) when traversing a wildcard reference.
 * rq:["../../../../reqlan rq/language/imports.rq".wildcard_references_webview]
 */
import {
    REQLAN_OPEN_WILDCARD_COMMAND,
    type WildcardReferenceArgs
} from '@reqlan/language';
import * as vscode from 'vscode';
import type { ActivityBarWebviewProvider } from '../activity_bar_module/activity-bar-webview-provider.js';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { WildcardMatchesPanel } from './wildcard-matches-panel.js';

export function registerWildcardReferenceCommand(
    context: vscode.ExtensionContext,
    getIndex: () => IndexService | undefined,
    getActivityBar: () => ActivityBarWebviewProvider | undefined
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            REQLAN_OPEN_WILDCARD_COMMAND,
            async (args: WildcardReferenceArgs | WildcardReferenceArgs[]) => {
                const payload = Array.isArray(args) ? args[0] : args;
                if (!payload?.ideaPattern) {
                    return;
                }
                await openWildcardReferenceMatches(payload, getIndex, getActivityBar);
            }
        )
    );
}

export async function openWildcardReferenceMatches(
    args: WildcardReferenceArgs,
    getIndex: () => IndexService | undefined,
    getActivityBar: () => ActivityBarWebviewProvider | undefined
): Promise<void> {
    const index = getIndex();
    if (!index) {
        void vscode.window.showWarningMessage('Reqlan index is not ready yet.');
        return;
    }
    await WildcardMatchesPanel.show(index, args, getActivityBar);
}

/** @deprecated Prefer {@link openWildcardReferenceMatches}. */
export async function openWildcardReferenceSearch(
    args: WildcardReferenceArgs,
    getActivityBar: () => ActivityBarWebviewProvider | undefined
): Promise<void> {
    const activityBar = getActivityBar();
    if (!activityBar) {
        void vscode.window.showWarningMessage('Reqlan activity bar is not ready yet.');
        return;
    }
    const { wildcardSearchSeed } = await import('../activity_bar_module/idea-path-filter.js');
    await activityBar.openSearch(wildcardSearchSeed(args));
}

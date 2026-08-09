/**
 * Open wildcard-matches webview (stats + requirements) when traversing a wildcard reference.
 * rq:["../../../../reqlan rq/language/imports.rq".wildcard_references_webview]
 */
import {
    REQLAN_OPEN_WILDCARD_COMMAND,
    REQLAN_WILDCARD_REFERENCE_AT_REQUEST,
    type WildcardReferenceArgs
} from '@reqlan/language';
import type { LanguageClient, LanguageClientOptions } from 'vscode-languageclient/node';
import { State } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import type { ActivityBarWebviewProvider } from '../activity_bar_module/activity-bar-webview-provider.js';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { WildcardMatchesPanel } from './wildcard-matches-panel.js';

export interface WildcardReferenceAtResponse {
    pathPattern: string;
    ideaPattern: string;
    fromUri: string;
}

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

export function withWildcardReferenceMiddleware(
    clientOptions: LanguageClientOptions,
    getClient: () => LanguageClient,
    getIndex: () => IndexService | undefined,
    getActivityBar: () => ActivityBarWebviewProvider | undefined
): LanguageClientOptions {
    return {
        ...clientOptions,
        middleware: {
            ...clientOptions.middleware,
            provideDefinition: async (document, position, token, next) => {
                const line = document.lineAt(position.line).text;
                if (!line.includes('["') && !line.includes("['")) {
                    return next(document, position, token);
                }
                if (!/[*?]/.test(line)) {
                    return next(document, position, token);
                }
                try {
                    const client = getClient();
                    if (client.state !== State.Running) {
                        return next(document, position, token);
                    }
                    const reference = await client.sendRequest<WildcardReferenceAtResponse | null>(
                        REQLAN_WILDCARD_REFERENCE_AT_REQUEST,
                        {
                            uri: document.uri.toString(),
                            text: document.getText(),
                            position
                        }
                    );
                    if (reference?.ideaPattern) {
                        await openWildcardReferenceMatches(reference, getIndex, getActivityBar);
                        return null;
                    }
                } catch {
                    // Fall through to default definition handling.
                }
                return next(document, position, token);
            }
        }
    };
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

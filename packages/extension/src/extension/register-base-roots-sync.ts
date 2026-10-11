/**
 * Send discovered base roots to the language server after the one workspace scan.
 * The server does not walk the tree itself.
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".single_sync_walk]
 */
import type * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';

export const REQLAN_BASES_NOTIFICATION = 'reqlan/bases';

export function registerBaseRootsSync(
    context: vscode.ExtensionContext,
    index: IndexService,
    getClient: () => LanguageClient | undefined
): void {
    const push = (): void => {
        const client = getClient();
        if (!client) {
            return;
        }
        client.sendNotification(REQLAN_BASES_NOTIFICATION, { roots: index.getBaseRoots() });
    };
    const unsubscribe = index.subscribeBaseRoots(() => {
        push();
    });
    context.subscriptions.push({ dispose: unsubscribe });
    push();
}

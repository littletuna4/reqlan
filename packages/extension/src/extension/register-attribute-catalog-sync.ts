/**
 * Pushes indexed attribute keys and values to the language server for completion.
 */
import {
    REQLAN_ATTRIBUTE_CATALOG_NOTIFICATION,
    type AttributeCatalog
} from 'reqlan-language';
import type * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';

export function registerAttributeCatalogSync(
    context: vscode.ExtensionContext,
    index: IndexService,
    getClient: () => LanguageClient | undefined
): void {
    const pushCatalog = async (): Promise<void> => {
        const client = getClient();
        if (!client || !index.isReady) {
            return;
        }
        try {
            const catalog = await index.indexStore.getAttributeCatalog();
            client.sendNotification(REQLAN_ATTRIBUTE_CATALOG_NOTIFICATION, catalog satisfies AttributeCatalog);
        } catch (error) {
            console.error('[reqlan] Failed to push attribute catalog:', error);
        }
    };

    const unsubscribe = index.subscribeCatalogUpdates(() => {
        void pushCatalog();
    });
    context.subscriptions.push({ dispose: unsubscribe });
    void pushCatalog();
}

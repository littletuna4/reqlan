/**
 * Pushes indexed idea / ideaset / file names to the language server for quick fixes.
 * rq:["../../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 */
import {
    REQLAN_NAME_CATALOG_NOTIFICATION,
    type NameCatalog,
    type NameCatalogEntry
} from 'reqlan-language';
import type * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';

export function registerNameCatalogSync(
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
            const catalog = await buildNameCatalog(index);
            client.sendNotification(REQLAN_NAME_CATALOG_NOTIFICATION, catalog satisfies NameCatalog);
        } catch (error) {
            console.error('[reqlan] Failed to push name catalog:', error);
        }
    };

    const unsubscribe = index.subscribeCatalogUpdates(() => {
        void pushCatalog();
    });
    context.subscriptions.push({ dispose: unsubscribe });
    void pushCatalog();
}

async function buildNameCatalog(index: IndexService): Promise<NameCatalog> {
    const ideas = await index.indexStore.listAllIdeas();
    const entries: NameCatalogEntry[] = [];
    const seenFiles = new Set<string>();

    for (const idea of ideas) {
        const kind = idea.kind === 'ideaset'
            ? 'ideaset'
            : idea.kind === 'oneliner'
                ? 'oneliner'
                : 'idea';
        entries.push({
            name: idea.name,
            kind,
            fileUri: idea.fileUri
        });
        if (!seenFiles.has(idea.fileUri)) {
            seenFiles.add(idea.fileUri);
            const base = idea.fileUri.split('/').pop()?.replace(/\.rq$/i, '') ?? '';
            if (base) {
                entries.push({
                    name: base,
                    kind: 'file',
                    fileUri: idea.fileUri
                });
            }
        }
    }

    return { entries };
}

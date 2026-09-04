/**
 * Push SQLite inbound edges for visible `.rq` editors to the language server.
 * Lazy: must not block open-file outbound links.
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
 * rq:["../../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 * rq:["../../../../reqlan rq/extension/language-support/open-file-sequencing.rq".lazy_features_after_outbound]
 */
import {
    REQLAN_INBOUND_SNAPSHOT_NOTIFICATION,
    type InboundFileSnapshot,
    type InboundSnapshotBatch,
    type InboundSnapshotReferencer
} from '@reqlan/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { resolveIndexFileUri, toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

export function registerInboundSqliteSync(
    context: vscode.ExtensionContext,
    index: IndexService,
    getClient: () => LanguageClient | undefined
): void {
    const pushSnapshots = async (): Promise<void> => {
        const client = getClient();
        if (!client) {
            return;
        }
        const editors = vscode.window.visibleTextEditors.filter(
            editor => editor.document.languageId === 'reqlan' || editor.document.uri.path.endsWith('.rq')
        );
        const snapshots: InboundFileSnapshot[] = [];
        if (!index.isReady) {
            for (const editor of editors) {
                const documentUri = editor.document.uri.toString();
                snapshots.push({
                    documentUri,
                    indexedUri: toIndexFileUri(editor.document.uri),
                    byIdeaName: {}
                });
            }
            client.sendNotification(
                REQLAN_INBOUND_SNAPSHOT_NOTIFICATION,
                { snapshots } satisfies InboundSnapshotBatch
            );
            return;
        }

        try {
            for (const editor of editors) {
                const documentUri = editor.document.uri.toString();
                const indexedUri = toIndexFileUri(editor.document.uri);
                const rows = await index.indexStore.getInboundForFile(indexedUri);
                const byIdeaName: Record<string, InboundSnapshotReferencer[]> = {};
                for (const row of rows) {
                    if (row.kind !== 'references' && row.kind !== 'wildcard_reference') {
                        continue;
                    }
                    const targetName = row.targetName;
                    const sourceName = row.sourceName;
                    if (!targetName || !sourceName) {
                        continue;
                    }
                    const sourceFileUri = row.sourceFileUri
                        ? resolveIndexFileUri(row.sourceFileUri).toString()
                        : documentUri;
                    const line = row.sourceIdeaLine ?? (row.sourceLine !== undefined ? Math.max(0, row.sourceLine - 1) : 0);
                    const list = byIdeaName[targetName] ?? [];
                    list.push({
                        name: sourceName,
                        uri: sourceFileUri,
                        line
                    });
                    byIdeaName[targetName] = list;
                }
                for (const name of Object.keys(byIdeaName)) {
                    byIdeaName[name] = dedupeReferencers(byIdeaName[name]!);
                }
                snapshots.push({ documentUri, indexedUri, byIdeaName });
            }
            client.sendNotification(
                REQLAN_INBOUND_SNAPSHOT_NOTIFICATION,
                { snapshots } satisfies InboundSnapshotBatch
            );
            await client.sendRequest('workspace/inlayHint/refresh').catch(() => undefined);
            await client.sendRequest('workspace/codeLens/refresh').catch(() => undefined);
        } catch (error) {
            console.error('[reqlan] Failed to push inbound snapshot:', error);
        }
    };

    const unsubscribe = index.subscribeCatalogUpdates(() => {
        void pushSnapshots();
    });
    context.subscriptions.push({ dispose: unsubscribe });
    context.subscriptions.push(
        vscode.window.onDidChangeVisibleTextEditors(() => {
            void pushSnapshots();
        })
    );
    void pushSnapshots();
}

function dedupeReferencers(rows: InboundSnapshotReferencer[]): InboundSnapshotReferencer[] {
    const seen = new Set<string>();
    const out: InboundSnapshotReferencer[] = [];
    for (const row of rows) {
        const key = `${row.uri}#${row.line}:${row.name}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(row);
    }
    return out.sort((left, right) => left.name.localeCompare(right.name));
}

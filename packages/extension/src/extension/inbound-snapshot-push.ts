/**
 * Build host→LSP inbound snapshot batches from SQLite.
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
 */
import type {
    InboundFileSnapshot,
    InboundSnapshotReferencer
} from '@reqlan/language';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { resolveIndexFileUri, toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import { toFileReferencerSnapshotRows } from './inbound-file-snapshot.js';
import { dedupeReferencers } from './inbound-snapshot-schedule.js';
import type * as vscode from 'vscode';

export {
    createCoalescedRunner,
    dedupeReferencers,
    shouldPushInboundSnapshots
} from './inbound-snapshot-schedule.js';

export async function buildInboundFileSnapshot(
    index: IndexService,
    documentUri: vscode.Uri
): Promise<InboundFileSnapshot> {
    const indexedUri = toIndexFileUri(documentUri);
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
            : documentUri.toString();
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
    const fileReferencers = toFileReferencerSnapshotRows(
        await index.indexStore.listInboundFileReferencers(indexedUri),
        sourceIndexedUri => resolveIndexFileUri(sourceIndexedUri).toString()
    );
    return {
        documentUri: documentUri.toString(),
        indexedUri,
        byIdeaName,
        fileReferencers: dedupeReferencers(fileReferencers)
    };
}

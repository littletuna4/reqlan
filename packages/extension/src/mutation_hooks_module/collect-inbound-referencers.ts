import type { SqliteIndexStore } from '@reqlan/analytical';
import { basename } from 'node:path';
import * as vscode from 'vscode';
import { resolveIndexFileUri, toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

/**
 * Collect workspace files that reference a moved path via the idea index.
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
 * rq:["../../../../reqlan rq/extension/features-mutation-hooks.rq".rename_file]
 */
export async function collectInboundReferencerUris(
    oldUri: vscode.Uri,
    indexStore: SqliteIndexStore
): Promise<vscode.Uri[]> {
    const indexedUri = toIndexFileUri(oldUri);
    const sourceIds = new Set<string>();

    for (const edge of await indexStore.getEdgesReferencingFile(indexedUri)) {
        sourceIds.add(edge.sourceId);
    }
    for (const edge of await indexStore.getEdgesReferencingFile(basename(indexedUri))) {
        sourceIds.add(edge.sourceId);
    }

    if (oldUri.fsPath.endsWith('.rq')) {
        for (const idea of await indexStore.getIdeasInFile(indexedUri)) {
            for (const edge of await indexStore.getEdgesTo(idea.id)) {
                sourceIds.add(edge.sourceId);
            }
        }
    }

    const fileUris = new Set<string>();
    for (const sourceId of sourceIds) {
        const idea = await indexStore.getIdea(sourceId);
        if (!idea?.fileUri) {
            continue;
        }
        fileUris.add(idea.fileUri);
    }

    const movedIndexed = indexedUri;
    return [...fileUris]
        .filter(fileUri => fileUri !== movedIndexed)
        .map(fileUri => resolveIndexFileUri(fileUri));
}

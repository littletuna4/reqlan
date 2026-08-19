import type { SqliteIndexStore } from '@reqlan/analytical';
import { basename } from 'node:path';
import * as vscode from 'vscode';
import { resolveIndexFileUri, toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import { collectInboundReferencerFileUris } from './collect-inbound-referencers-core.js';

/**
 * Collect workspace files that reference a moved path via the idea index.
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
 * rq:["../../../../reqlan rq/extension/features-mutation-hooks.rq".rename_file]
 */
export async function collectInboundReferencerUris(
    oldUri: vscode.Uri,
    indexStore: SqliteIndexStore
): Promise<vscode.Uri[]> {
    const indexedUri = toIndexFileUri(oldUri);
    const fileUris = await collectInboundReferencerFileUris(
        indexedUri,
        basename(indexedUri),
        oldUri.fsPath.endsWith('.rq'),
        indexStore
    );
    return fileUris.map(fileUri => resolveIndexFileUri(fileUri));
}

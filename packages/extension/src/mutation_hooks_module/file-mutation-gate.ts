import type * as vscode from 'vscode';
import type { SqliteIndexStore } from 'reqlan-analytical';
import { basename } from 'node:path';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

export async function shouldPromptForMovedFile(
    uri: vscode.Uri,
    indexStore: SqliteIndexStore
): Promise<boolean> {
    const indexedUri = toIndexFileUri(uri);
    if (uri.fsPath.endsWith('.rq')) {
        return rqFileHasGraphReferences(indexStore, indexedUri);
    }
    return codeFileHasInboundReqlanReferences(indexStore, indexedUri);
}

async function rqFileHasGraphReferences(store: SqliteIndexStore, fileUri: string): Promise<boolean> {
    const ideas = await store.getIdeasInFile(fileUri);
    for (const idea of ideas) {
        if ((await store.getEdgesFrom(idea.id)).length > 0) {
            return true;
        }
        if ((await store.getEdgesTo(idea.id)).length > 0) {
            return true;
        }
    }
    return (await store.getEdgesReferencingFile(fileUri)).length > 0;
}

async function codeFileHasInboundReqlanReferences(store: SqliteIndexStore, fileUri: string): Promise<boolean> {
    if ((await store.getEdgesReferencingFile(fileUri)).length > 0) {
        return true;
    }
    const fileName = basename(fileUri);
    return (await store.getEdgesReferencingFile(fileName)).length > 0;
}

import { URI } from 'langium';
import {
    buildInboundPathRewriteEdits,
    buildPathRewriteEdits,
    findPathReferencesInMovedFile,
    type PathRewriteEdit
} from '@reqlan/language';
import type { SqliteIndexStore } from '@reqlan/analytical';
import * as vscode from 'vscode';
import { collectInboundReferencerUris } from './collect-inbound-referencers.js';

export interface FileMoveChange {
    uri: vscode.Uri;
    oldUri: vscode.Uri;
    edits: PathRewriteEdit[];
}

/**
 * Plan outbound path rewrites inside moved files and inbound rewrites in referencers.
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
 * rq:["../../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
 * rq:["../../../../reqlan rq/extension/features-mutation-hooks.rq".rename_file]
 */
export async function planFileMoveChanges(
    files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>,
    indexStore?: SqliteIndexStore
): Promise<FileMoveChange[]> {
    const changesByUri = new Map<string, FileMoveChange>();

    for (const { oldUri, newUri } of files) {
        const document = await vscode.workspace.openTextDocument(newUri);
        const isRqFile = newUri.fsPath.endsWith('.rq');
        const references = findPathReferencesInMovedFile(document.getText(), isRqFile);
        const outboundEdits = buildPathRewriteEdits(
            references,
            URI.parse(oldUri.toString()),
            URI.parse(newUri.toString()),
            (_path, newPath) => JSON.stringify(newPath)
        );
        mergeChange(changesByUri, {
            uri: newUri,
            oldUri,
            edits: outboundEdits
        });

        if (!indexStore) {
            continue;
        }
        const inboundUris = await collectInboundReferencerUris(oldUri, indexStore);
        for (const inboundUri of inboundUris) {
            if (files.some(file => file.newUri.toString() === inboundUri.toString()
                || file.oldUri.toString() === inboundUri.toString())) {
                continue;
            }
            let inboundDoc: vscode.TextDocument;
            try {
                inboundDoc = await vscode.workspace.openTextDocument(inboundUri);
            } catch {
                continue;
            }
            const inboundIsRq = inboundUri.fsPath.endsWith('.rq');
            const inboundRefs = findPathReferencesInMovedFile(inboundDoc.getText(), inboundIsRq);
            const inboundEdits = buildInboundPathRewriteEdits(
                inboundRefs,
                URI.parse(inboundUri.toString()),
                URI.parse(oldUri.toString()),
                URI.parse(newUri.toString()),
                (_path, newPath) => JSON.stringify(newPath)
            );
            if (inboundEdits.length === 0) {
                continue;
            }
            mergeChange(changesByUri, {
                uri: inboundUri,
                oldUri: inboundUri,
                edits: inboundEdits
            });
        }
    }

    return [...changesByUri.values()].filter(change => change.edits.length > 0);
}

function mergeChange(map: Map<string, FileMoveChange>, change: FileMoveChange): void {
    const key = change.uri.toString();
    const existing = map.get(key);
    if (!existing) {
        map.set(key, change);
        return;
    }
    existing.edits = dedupeEdits([...existing.edits, ...change.edits]);
}

function dedupeEdits(edits: PathRewriteEdit[]): PathRewriteEdit[] {
    const seen = new Set<string>();
    const unique: PathRewriteEdit[] = [];
    for (const edit of edits) {
        const key = [
            edit.range.start.line,
            edit.range.start.character,
            edit.range.end.line,
            edit.range.end.character,
            edit.newText
        ].join(':');
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(edit);
    }
    return unique;
}

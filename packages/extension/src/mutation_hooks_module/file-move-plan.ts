import { URI } from 'langium';
import {
    buildPathRewriteEdits,
    findPathReferencesInMovedFile,
    type PathRewriteEdit
} from 'reqlan-language';
import * as vscode from 'vscode';

export interface FileMoveChange {
    uri: vscode.Uri;
    oldUri: vscode.Uri;
    edits: PathRewriteEdit[];
}

export async function planFileMoveChanges(
    files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>
): Promise<FileMoveChange[]> {
    const changes: FileMoveChange[] = [];
    for (const { oldUri, newUri } of files) {
        const document = await vscode.workspace.openTextDocument(newUri);
        const isRqFile = newUri.fsPath.endsWith('.rq');
        const references = findPathReferencesInMovedFile(document.getText(), isRqFile);
        const edits = buildPathRewriteEdits(
            references,
            URI.parse(oldUri.toString()),
            URI.parse(newUri.toString()),
            (_path, newPath) => JSON.stringify(newPath)
        );
        if (edits.length === 0) {
            continue;
        }
        changes.push({ uri: newUri, oldUri, edits });
    }
    return changes;
}

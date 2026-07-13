import type { PathRewriteEdit } from 'reqlan-language';
import * as vscode from 'vscode';
import type { FileMoveChange } from './file-move-plan.js';

export async function applyFileMoveChanges(changes: FileMoveChange[]): Promise<boolean> {
    const edit = new vscode.WorkspaceEdit();
    for (const change of changes) {
        for (const textEdit of change.edits) {
            edit.replace(change.uri, toVscodeRange(textEdit), textEdit.newText);
        }
    }
    return vscode.workspace.applyEdit(edit);
}

export async function showFileMoveDiffs(changes: FileMoveChange[]): Promise<void> {
    for (const change of changes) {
        const original = await vscode.workspace.openTextDocument(change.uri);
        const updatedText = applyEditsToText(original.getText(), change.edits);
        const preview = await vscode.workspace.openTextDocument({
            language: original.languageId,
            content: updatedText
        });
        const title = `${vscode.workspace.asRelativePath(change.uri)} (reqlan path updates)`;
        await vscode.commands.executeCommand(
            'vscode.diff',
            change.uri,
            preview.uri,
            title
        );
    }
}

function applyEditsToText(text: string, edits: PathRewriteEdit[]): string {
    const sorted = [...edits].sort((left, right) => {
        const leftOffset = offsetAt(text, left.range.start);
        const rightOffset = offsetAt(text, right.range.start);
        return rightOffset - leftOffset;
    });
    let result = text;
    for (const edit of sorted) {
        const start = offsetAt(result, edit.range.start);
        const end = offsetAt(result, edit.range.end);
        result = `${result.slice(0, start)}${edit.newText}${result.slice(end)}`;
    }
    return result;
}

function offsetAt(text: string, position: { line: number; character: number }): number {
    const lines = text.split(/\r?\n/);
    let offset = 0;
    for (let index = 0; index < position.line; index++) {
        offset += lines[index]!.length + 1;
    }
    return offset + position.character;
}

function toVscodeRange(edit: PathRewriteEdit): vscode.Range {
    return new vscode.Range(
        edit.range.start.line,
        edit.range.start.character,
        edit.range.end.line,
        edit.range.end.character
    );
}

import * as vscode from 'vscode';
import { pickOpenWorkspaceDocument } from './open-index-file-pick.js';
import { resolveIndexFileUri } from './resolve-index-file-uri.js';

/**
 * Open an indexed file at a line/column.
 * rq:["../../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_open_live_file]
 *
 * Show a visible workspace tab for that path when one exists.
 * Do not open a detached `file://` copy — Cursor can show that as a
 * read-only tab with stale content.
 *
 * If Cursor rejects `openTextDocument` with a false size-limit error,
 * fall back to Quick Open (that path does not use extension-host sync).
 */
export async function openIndexFile(
    fileUri: string,
    line = 0,
    column = 0,
    baseRoot?: string
): Promise<void> {
    const uri = resolveIndexFileUri(fileUri, baseRoot);
    const position = new vscode.Position(Math.max(0, line), Math.max(0, column));
    const options: vscode.TextDocumentShowOptions = {
        selection: new vscode.Range(position, position),
        preview: false
    };

    const existing = pickOpenWorkspaceDocument(
        vscode.window.visibleTextEditors
            .map(editor => editor.document)
            .filter(document => vscode.workspace.getWorkspaceFolder(document.uri)),
        uri
    );
    if (existing) {
        await vscode.window.showTextDocument(existing, options);
        return;
    }

    try {
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, options);
    } catch (error) {
        if (!isTooLargeForSyncError(error)) {
            throw error;
        }
        await vscode.commands.executeCommand('workbench.action.quickOpen', uri.fsPath);
        const detail = error instanceof Error ? error.message : String(error);
        void vscode.window.showWarningMessage(
            `Cursor blocked opening ${vscode.workspace.asRelativePath(uri)} from the extension host` +
                (detail ? ` (${detail})` : '') +
                '. Path is in Quick Open — press Enter.'
        );
    }
}

function isTooLargeForSyncError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /size limit|cannot be synchronized/i.test(message);
}

import * as vscode from 'vscode';
import { resolveIndexFileUri } from './resolve-index-file-uri.js';

/**
 * Open an indexed file at a line/column.
 *
 * Cursor can reject workspace.openTextDocument / vscode.open with a false
 * "Documents above the size limit cannot be synchronized with extensions"
 * error for small files (bad FileStat.size from the FS provider). Prefer an
 * already-synced document, then try file:// (local to the remote EH), then
 * the resolved URI, then Quick Open as a last resort.
 */
export async function openIndexFile(fileUri: string, line = 0, column = 0): Promise<void> {
    const uri = resolveIndexFileUri(fileUri);
    const position = new vscode.Position(Math.max(0, line), Math.max(0, column));
    const options: vscode.TextDocumentShowOptions = {
        selection: new vscode.Range(position, position),
        preview: false
    };

    const existing = findOpenDocument(uri);
    if (existing) {
        await vscode.window.showTextDocument(existing, options);
        return;
    }

    const candidates = uniqueUris(vscode.Uri.file(uri.fsPath), uri);
    let lastError: unknown;
    for (const candidate of candidates) {
        try {
            await vscode.commands.executeCommand('vscode.open', candidate, options);
            return;
        } catch (error) {
            lastError = error;
            if (!isTooLargeForSyncError(error)) {
                throw error;
            }
        }
        try {
            const document = await vscode.workspace.openTextDocument(candidate);
            await vscode.window.showTextDocument(document, options);
            return;
        } catch (error) {
            lastError = error;
            if (!isTooLargeForSyncError(error)) {
                throw error;
            }
        }
    }

    // Cursor UI Quick Open does not hit the extension-host sync size check.
    await vscode.commands.executeCommand('workbench.action.quickOpen', uri.fsPath);
    const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '');
    void vscode.window.showWarningMessage(
        `Cursor blocked opening ${vscode.workspace.asRelativePath(uri)} from the extension host` +
            (detail ? ` (${detail})` : '') +
            '. Path is in Quick Open — press Enter.'
    );
}

function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(
        document => document.uri.fsPath === uri.fsPath || document.uri.toString() === uri.toString()
    );
}

function uniqueUris(...uris: vscode.Uri[]): vscode.Uri[] {
    const seen = new Set<string>();
    const result: vscode.Uri[] = [];
    for (const uri of uris) {
        const key = uri.toString();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(uri);
    }
    return result;
}

function isTooLargeForSyncError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /size limit|cannot be synchronized/i.test(message);
}

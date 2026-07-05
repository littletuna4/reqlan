import * as vscode from 'vscode';
import { resolveWorkspaceFileUri, toWorkspaceRelativePath } from 'reqlan-analytical';

export function resolveIndexFileUri(fileUri: string): vscode.Uri {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return vscode.Uri.parse(resolveWorkspaceFileUri(fileUri, workspaceRoot));
}

export function toIndexFileUri(uri: vscode.Uri): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return uri.toString();
    }
    return toWorkspaceRelativePath(uri.toString(), workspaceRoot);
}

import * as vscode from 'vscode';
import { resolveWorkspaceFileUri, toWorkspaceRelativePath } from 'reqlan-analytical';

function joinWorkspaceRelative(workspaceFolder: vscode.Uri, relativePath: string): vscode.Uri {
    const segments = relativePath.replace(/\\/g, '/').split('/').filter(segment => segment.length > 0);
    return vscode.Uri.joinPath(workspaceFolder, ...segments);
}

export function resolveIndexFileUri(fileUri: string): vscode.Uri {
    if (fileUri.includes('://')) {
        return vscode.Uri.parse(fileUri);
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceFolder) {
        return vscode.Uri.parse(resolveWorkspaceFileUri(fileUri));
    }

    const workspaceRoot = workspaceFolder.fsPath;
    const relativePath = fileUri.startsWith('/')
        ? toWorkspaceRelativePath(fileUri, workspaceRoot)
        : fileUri.replace(/\\/g, '/');

    if (relativePath.includes('://') || relativePath.startsWith('..')) {
        return vscode.Uri.parse(resolveWorkspaceFileUri(fileUri, workspaceRoot));
    }

    return joinWorkspaceRelative(workspaceFolder, relativePath);
}

export function toIndexFileUri(uri: vscode.Uri): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return uri.fsPath;
    }
    return toWorkspaceRelativePath(uri.fsPath, workspaceRoot);
}

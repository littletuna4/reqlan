import * as vscode from 'vscode';
import { nearestBaseRoot, resolveWorkspaceFileUri, toWorkspaceRelativePath } from '@reqlan/analytical';

function joinWorkspaceRelative(workspaceFolder: vscode.Uri, relativePath: string): vscode.Uri {
    const segments = relativePath.replace(/\\/g, '/').split('/').filter(segment => segment.length > 0);
    return vscode.Uri.joinPath(workspaceFolder, ...segments);
}

/** Ancestor `.reqlan` walk — never `discoverBases` (full-tree scan) on open/click. */
function resolveBaseRootForPath(filePath: string): string | undefined {
    const roots = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
    if (roots.length === 0) {
        return nearestBaseRoot(filePath);
    }
    return nearestBaseRoot(filePath, roots) ?? roots[0];
}

export function resolveIndexFileUri(fileUri: string, baseRoot?: string): vscode.Uri {
    if (fileUri.includes('://')) {
        return vscode.Uri.parse(fileUri);
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const root =
        baseRoot ??
        (fileUri.startsWith('/') || /^[A-Za-z]:/.test(fileUri)
            ? resolveBaseRootForPath(fileUri)
            : workspaceFolder?.fsPath);

    if (!root) {
        return vscode.Uri.parse(resolveWorkspaceFileUri(fileUri));
    }

    const relativePath = fileUri.startsWith('/') || /^[A-Za-z]:/.test(fileUri)
        ? toWorkspaceRelativePath(fileUri, root)
        : fileUri.replace(/\\/g, '/');

    if (relativePath.includes('://') || relativePath.startsWith('..')) {
        return vscode.Uri.parse(resolveWorkspaceFileUri(fileUri, root));
    }

    // Prefer the workspace folder that matches the base root when possible
    const matchingFolder = vscode.workspace.workspaceFolders?.find(f => {
        const fp = f.uri.fsPath.replace(/\\/g, '/');
        const br = root.replace(/\\/g, '/');
        return br === fp || br.startsWith(fp + '/');
    });
    const folderUri = matchingFolder?.uri ?? vscode.Uri.file(root);
    return joinWorkspaceRelative(folderUri, relativePath);
}

export function toIndexFileUri(uri: vscode.Uri, baseRoot?: string): string {
    const root = baseRoot ?? resolveBaseRootForPath(uri.fsPath) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        return uri.fsPath;
    }
    return toWorkspaceRelativePath(uri.fsPath, root);
}

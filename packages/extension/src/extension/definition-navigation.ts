/**
 * Definition results stay locations so the editor owns Go Back and Go Forward.
 * Prefer an open workspace tab for the target URI (no detached file:// copy).
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 * rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_navigate_back]
 */
import * as vscode from 'vscode';
import { pickOpenWorkspaceDocument } from '../analytical_submodule/index-store/open-index-file-pick.js';

/** Prefer the live workspace tab URI when the path is already open. */
export function preferWorkspaceUri(target: vscode.Uri): vscode.Uri {
    if (target.scheme !== 'file') {
        return target;
    }
    const open = vscode.window.visibleTextEditors
        .map(editor => editor.document)
        .filter(document => vscode.workspace.getWorkspaceFolder(document.uri));
    return pickOpenWorkspaceDocument(open, target)?.uri ?? target;
}

export type DefinitionResult = vscode.Definition | vscode.LocationLink[] | null | undefined;

function isLocationLink(
    item: vscode.Location | vscode.LocationLink
): item is vscode.LocationLink {
    return 'targetUri' in item;
}

export function rewriteDefinitionTargets(result: DefinitionResult): DefinitionResult {
    if (!result) {
        return result;
    }
    if (!Array.isArray(result)) {
        return new vscode.Location(preferWorkspaceUri(result.uri), result.range);
    }
    if (result.length === 0) {
        return result;
    }
    if (isLocationLink(result[0]!)) {
        return (result as vscode.LocationLink[]).map(link => ({
            ...link,
            targetUri: preferWorkspaceUri(link.targetUri)
        }));
    }
    return (result as vscode.Location[]).map(
        location => new vscode.Location(preferWorkspaceUri(location.uri), location.range)
    );
}

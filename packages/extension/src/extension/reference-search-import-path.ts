/**
 * Build relative import paths from index file URIs (often workspace-relative).
 * rq:["../../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import * as path from 'node:path';
import { URI } from 'langium';
import { relativeRqImportPath } from '@reqlan/language';

/**
 * Index ideas store workspace-relative paths like `reqlan rq/site/site.rq`.
 * Turn those (or absolute / file:// URIs) into a file URI string for path math.
 */
export function absoluteFileUriFromIndex(indexFileUri: string, workspaceRootFsPath?: string): string {
    if (indexFileUri.includes('://')) {
        return URI.parse(indexFileUri).toString();
    }
    if (path.isAbsolute(indexFileUri)) {
        return URI.file(indexFileUri).toString();
    }
    if (workspaceRootFsPath) {
        return URI.file(path.resolve(workspaceRootFsPath, indexFileUri)).toString();
    }
    return URI.file(path.resolve(indexFileUri)).toString();
}

export function relativeImportPathForIndexedFile(
    documentUri: string,
    indexFileUri: string,
    workspaceRootFsPath?: string
): string {
    return relativeRqImportPath(
        URI.parse(documentUri),
        URI.parse(absoluteFileUriFromIndex(indexFileUri, workspaceRootFsPath))
    );
}

export function isSameIndexedFile(
    documentUri: string,
    indexFileUri: string,
    workspaceRootFsPath?: string
): boolean {
    const left = URI.parse(documentUri).fsPath;
    const right = URI.parse(absoluteFileUriFromIndex(indexFileUri, workspaceRootFsPath)).fsPath;
    return path.normalize(left) === path.normalize(right);
}

/**
 * Build relative import paths from index file URIs (often workspace-relative).
 * rq:["../../../../reqlan rq/extension/host/features-commands.rq".search_code_actions]
 */
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { relativeRqImportPath } from '@reqlan/language';

/**
 * Index ideas store workspace-relative paths like `reqlan rq/site/site.rq`.
 * Turn those (or absolute / file:// URIs) into a file URI string for path math.
 */
export function absoluteFileUriFromIndex(indexFileUri: string, workspaceRootFsPath?: string): string {
    if (indexFileUri.includes('://')) {
        return new URL(indexFileUri).href;
    }
    if (path.isAbsolute(indexFileUri)) {
        return pathToFileURL(indexFileUri).href;
    }
    if (workspaceRootFsPath) {
        return pathToFileURL(path.resolve(workspaceRootFsPath, indexFileUri)).href;
    }
    return pathToFileURL(path.resolve(indexFileUri)).href;
}

export function relativeImportPathForIndexedFile(
    documentUri: string,
    indexFileUri: string,
    workspaceRootFsPath?: string
): string {
    return relativeRqImportPath(
        documentUri,
        absoluteFileUriFromIndex(indexFileUri, workspaceRootFsPath)
    );
}

export function isSameIndexedFile(
    documentUri: string,
    indexFileUri: string,
    workspaceRootFsPath?: string
): boolean {
    const left = fileURLToPath(documentUri);
    const right = fileURLToPath(
        absoluteFileUriFromIndex(indexFileUri, workspaceRootFsPath)
    );
    return path.normalize(left) === path.normalize(right);
}

/**
 * Resolve authored file-reference paths against the defining idea's file.
 * Shared by graph slices and reference-list rows so open actions match the editor.
 * rq:["../../../../reqlan rq/ontology.rq".referenced_files]
 * rq:["../../../../reqlan rq/ontology.rq".reference_types]
 */
import { isWindowsAbsolutePath } from './path-relative.js';
import { posix } from 'node:path';

function definingFilePath(sourceId: string): string {
    const separator = sourceId.lastIndexOf('#');
    return separator >= 0 ? sourceId.slice(0, separator) : sourceId;
}

/**
 * File references are authored relative to the file that defines them, not the
 * workspace root, so `targetFile` alone cannot be opened reliably (e.g. a
 * `../../foo.ts` reference would otherwise be resolved against the workspace
 * root). Resolve it against the defining file's folder so open actions receive
 * a workspace-relative path.
 */
export function resolveReferencedFilePath(targetFile: string, sourceId: string): string {
    const target = targetFile.replace(/\\/g, '/');
    if (target.includes('://') || posix.isAbsolute(target) || isWindowsAbsolutePath(targetFile) || isWindowsAbsolutePath(target)) {
        return targetFile;
    }
    const definingFile = definingFilePath(sourceId).replace(/\\/g, '/');
    if (
        !definingFile
        || definingFile.includes('://')
        || posix.isAbsolute(definingFile)
        || isWindowsAbsolutePath(definingFile)
    ) {
        return targetFile;
    }
    return posix.join(posix.dirname(definingFile), target);
}

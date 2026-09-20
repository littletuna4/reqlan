/**
 * Path-resolve context for `rq:[…]` links in non-`.rq` source files.
 * rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_import_root_alias]
 * rq:["../../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
 */
import {
    pathResolveContextFromWorkspaceFolders,
    type PathResolveContext,
    type RqConfig
} from '@reqlan/language';
import type { FileSystemProvider } from 'langium';

const rqConfigCache = new Map<string, RqConfig | undefined>();

export function clearCommentReferenceConfigCache(): void {
    rqConfigCache.clear();
}

export function createCommentReferencePathContext(
    sourceFsPath: string,
    workspaceFolderFsPaths: readonly string[],
    fileSystem?: FileSystemProvider
): PathResolveContext {
    return pathResolveContextFromWorkspaceFolders(
        sourceFsPath,
        workspaceFolderFsPaths,
        fileSystem,
        rqConfigCache
    );
}

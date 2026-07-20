/**
 * Recompute relative file paths when a referencing file moves to a new directory.
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
 * rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
 * rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
 */
import { URI, UriUtils } from 'langium';
import type { Range } from 'vscode-languageserver';
import {
    DEFAULT_IMPORT_ROOT_ALIAS,
    matchImportRootMapping,
    type ImportRootMapping
} from './reqlan-path-resolve.js';

export interface PathReference {
    path: string;
    range: Range;
}

export interface PathRewriteEdit {
    range: Range;
    newText: string;
}

export interface PathRewriteOptions {
    /** Alias mappings; defaults to the single `@` alias. */
    importRoots?: readonly ImportRootMapping[];
}

function rewriteImportRoots(options?: PathRewriteOptions): readonly ImportRootMapping[] {
    return options?.importRoots ?? [{ alias: DEFAULT_IMPORT_ROOT_ALIAS }];
}

export function relativePathWithoutExtension(dirname: string, targetUri: URI): string {
    const uriString = targetUri.toString();
    const uriWithoutExt = uriString.slice(0, uriString.length - UriUtils.extname(targetUri).length);
    let relativePath = UriUtils.relative(dirname, uriWithoutExt);
    if (!relativePath.startsWith('.')) {
        relativePath = `./${relativePath}`;
    }
    return relativePath;
}

export function rewriteRelativePath(
    path: string,
    oldFileUri: URI,
    newFileUri: URI,
    options?: PathRewriteOptions
): string | undefined {
    if (!path || path.startsWith('file://')) {
        return undefined;
    }
    if (matchImportRootMapping(path, rewriteImportRoots(options)) !== undefined) {
        return undefined;
    }
    const oldDir = UriUtils.dirname(oldFileUri);
    const newDir = UriUtils.dirname(newFileUri);
    const resolved = UriUtils.resolvePath(oldDir, path);
    let relativePath = UriUtils.relative(newDir, resolved);
    if (!relativePath.startsWith('.')) {
        relativePath = `./${relativePath}`;
    }
    return relativePath === path ? undefined : relativePath;
}

export function rewriteQuotedPath(
    path: string,
    oldFileUri: URI,
    newFileUri: URI,
    options?: PathRewriteOptions
): string | undefined {
    const rewritten = rewriteRelativePath(path, oldFileUri, newFileUri, options);
    return rewritten === undefined ? undefined : JSON.stringify(rewritten);
}

export function buildPathRewriteEdits(
    references: PathReference[],
    oldFileUri: URI,
    newFileUri: URI,
    formatReplacement: (path: string, newPath: string, range: Range) => string | undefined,
    options?: PathRewriteOptions
): PathRewriteEdit[] {
    const edits: PathRewriteEdit[] = [];
    for (const reference of references) {
        const newPath = rewriteRelativePath(reference.path, oldFileUri, newFileUri, options);
        if (newPath === undefined) {
            continue;
        }
        const newText = formatReplacement(reference.path, newPath, reference.range);
        if (newText === undefined) {
            continue;
        }
        edits.push({ range: reference.range, newText });
    }
    return edits;
}

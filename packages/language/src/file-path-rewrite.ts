/**
 * Recompute relative file paths when a referencing file moves to a new directory,
 * or when a referenced target file moves and inbound paths must be updated.
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
 * rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
 * rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
 * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
 * rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
 */
import { URI, UriUtils } from 'langium';
import type { Range } from 'vscode-languageserver';
import { importPathWithImplicitExtension } from './reqlan-imports.js';
import {
    DEFAULT_IMPORT_ROOT_ALIAS,
    matchImportRootMapping,
    type ImportRootMapping
} from './reqlan-path-resolve.js';

export interface PathReference {
    path: string;
    range: Range;
    /** Idea name when this path came from `rq:["path".idea]`. */
    idea?: string;
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

function ensureDotRelative(path: string): string {
    return path.startsWith('.') ? path : `./${path}`;
}

function uriWithoutExtension(uri: URI): string {
    const uriString = uri.toString();
    const ext = UriUtils.extname(uri);
    return ext ? uriString.slice(0, uriString.length - ext.length) : uriString;
}

function urisReferToSameTarget(left: URI, right: URI): boolean {
    return left.toString() === right.toString()
        || uriWithoutExtension(left) === uriWithoutExtension(right);
}

function pathHadExplicitExtension(path: string): boolean {
    const basename = path.slice(path.lastIndexOf('/') + 1);
    return basename.includes('.', 1);
}

export function relativePathWithoutExtension(dirname: string, targetUri: URI): string {
    let relativePath = UriUtils.relative(dirname, uriWithoutExtension(targetUri));
    return ensureDotRelative(relativePath);
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
    const relativePath = ensureDotRelative(UriUtils.relative(newDir, resolved));
    return relativePath === path ? undefined : relativePath;
}

/**
 * When the *target* of a path moves, recompute the path as seen from the referencing file.
 */
export function rewritePathToMovedTarget(
    path: string,
    referencingFileUri: URI,
    oldTargetUri: URI,
    newTargetUri: URI,
    options?: PathRewriteOptions
): string | undefined {
    if (!path || path.startsWith('file://')) {
        return undefined;
    }
    if (matchImportRootMapping(path, rewriteImportRoots(options)) !== undefined) {
        return undefined;
    }
    const refDir = UriUtils.dirname(referencingFileUri);
    const candidates = [UriUtils.resolvePath(refDir, path)];
    const withExt = importPathWithImplicitExtension(path);
    if (withExt) {
        candidates.push(UriUtils.resolvePath(refDir, withExt));
    }
    if (!candidates.some(candidate => urisReferToSameTarget(candidate, oldTargetUri))) {
        return undefined;
    }

    const keepExtension = pathHadExplicitExtension(path);
    const newRelative = keepExtension
        ? ensureDotRelative(UriUtils.relative(refDir, newTargetUri))
        : relativePathWithoutExtension(refDir.toString(), newTargetUri);
    return newRelative === path ? undefined : newRelative;
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

export function buildInboundPathRewriteEdits(
    references: PathReference[],
    referencingFileUri: URI,
    oldTargetUri: URI,
    newTargetUri: URI,
    formatReplacement: (path: string, newPath: string, range: Range) => string | undefined,
    options?: PathRewriteOptions
): PathRewriteEdit[] {
    const edits: PathRewriteEdit[] = [];
    for (const reference of references) {
        const newPath = rewritePathToMovedTarget(
            reference.path,
            referencingFileUri,
            oldTargetUri,
            newTargetUri,
            options
        );
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

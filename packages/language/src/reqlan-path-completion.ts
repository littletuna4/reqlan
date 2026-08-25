/**
 * Shared import / anonymous file-path completion candidates, folder browsing, and proximity ranking.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_explicit_extension]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_path_segments]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_substring_match]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_ranking]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".anonymous_reference_code_completion]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
 */
import type { FileSystemProvider, LangiumDocument, LangiumDocuments, URI } from 'langium';
import { UriUtils } from 'langium';
import { relativeRqImportPath } from './reqlan-import-edits.js';
import {
    resolveDocumentPathUri,
    resolveImportRootUri,
    resolveRqConfig,
    type PathResolveContext
} from './reqlan-path-resolve.js';

export const UNREACHABLE_PATH_DISTANCE = 9999;

/** Directories that must not be walked for path completion (dependency and build output trees). */
const SKIP_DIRECTORY_NAMES = new Set([
    'node_modules',
    'dist',
    'build',
    'target',
    'coverage',
    'out',
    '__pycache__'
]);

export interface PathCompletionCandidate {
    path: string;
    targetUri: URI;
    isDirectory: boolean;
}

export interface CollectPathCompletionOptions {
    /** When set (e.g. `.rq`), only files with that extension are included. Directories always included. */
    extensionFilter?: string;
    /** Unquoted typed query; folder browsing when it ends with `/`, otherwise substring/subsequence search. */
    prefix?: string;
}

/** Directory hop count between two directory URIs (each `..` or named segment counts). */
export function directoryHopDistance(fromDir: URI, toDir: URI): number {
    const relative = UriUtils.relative(fromDir.toString(), toDir.toString());
    if (!relative || relative === '.') {
        return 0;
    }
    return relative.split('/').filter(segment => segment.length > 0 && segment !== '.').length;
}

/** Proximity of a path candidate from the completing document's directory. */
export function pathCandidateHopDistance(document: LangiumDocument, candidate: PathCompletionCandidate): number {
    const fromDir = UriUtils.dirname(document.uri);
    const toDir = candidate.isDirectory ? candidate.targetUri : UriUtils.dirname(candidate.targetUri);
    return directoryHopDistance(fromDir, toDir);
}

/**
 * Rank by proximity, then directories before files, then path alphabetically.
 * Puts `../path/` before `../path/file.rq` when hop distance ties.
 */
export function pathCompletionSortText(document: LangiumDocument, candidate: PathCompletionCandidate): string {
    const hops = pathCandidateHopDistance(document, candidate);
    const directoryRank = candidate.isDirectory ? '0' : '1';
    return `${String(hops).padStart(4, '0')}_${directoryRank}_${candidate.path}`;
}

/**
 * Equalize client fuzzy-match scores so sortText (proximity) wins.
 * VS Code/Cursor re-ranks by filterText/label match first; sortText is only a tie-breaker.
 * The server already filters via pathMatchesQuery and returns isIncomplete lists.
 */
export function pathCompletionFilterText(prefix: string, candidate: PathCompletionCandidate): string {
    return prefix.length > 0 ? prefix : candidate.path;
}

export function comparePathCompletionCandidates(
    document: LangiumDocument,
    left: PathCompletionCandidate,
    right: PathCompletionCandidate
): number {
    return pathCompletionSortText(document, left).localeCompare(pathCompletionSortText(document, right));
}

export function relativePathKeepExtension(fromDir: string, targetUri: URI): string {
    let relativePath = UriUtils.relative(fromDir, targetUri.toString());
    if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
        relativePath = `./${relativePath}`;
    }
    return relativePath;
}

export function aliasedPathKeepExtension(
    rootString: string,
    aliasPrefix: string,
    targetUri: URI
): string | undefined {
    const relativePath = UriUtils.relative(rootString, targetUri.toString());
    if (!relativePath || relativePath.startsWith('..')) {
        return undefined;
    }
    const cleaned = relativePath.replace(/^\.\//, '');
    return `${aliasPrefix}${cleaned}`;
}

/**
 * Match a typed query against a candidate path using substring search (not only starts-with).
 * Also matches when query characters appear in order after stripping `/` and `.` path markers
 * (so `hellopath` matches `../../hello/inbetween/path/file.rq`).
 */
export function pathMatchesQuery(path: string, query: string): boolean {
    if (!query) {
        return true;
    }
    const pathLower = path.toLowerCase();
    const queryLower = query.toLowerCase();
    if (pathLower.includes(queryLower)) {
        return true;
    }
    const strippedPath = stripPathSeparators(pathLower);
    const strippedQuery = stripPathSeparators(queryLower);
    if (!strippedQuery) {
        return true;
    }
    if (strippedPath.includes(strippedQuery)) {
        return true;
    }
    return isCharacterSubsequence(strippedPath, strippedQuery);
}

function stripPathSeparators(value: string): string {
    return value.replace(/\.?\.\//g, '').replace(/\.\//g, '').replace(/\//g, '');
}

function isCharacterSubsequence(haystack: string, needle: string): boolean {
    let index = 0;
    for (const char of haystack) {
        if (char === needle[index]) {
            index += 1;
            if (index >= needle.length) {
                return true;
            }
        }
    }
    return false;
}

export function collectPathCompletionCandidates(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    pathContext: PathResolveContext,
    options: CollectPathCompletionOptions = {}
): PathCompletionCandidate[] {
    const byPath = new Map<string, PathCompletionCandidate>();
    const add = (candidate: PathCompletionCandidate) => {
        byPath.set(candidate.path, candidate);
    };
    const addFile = (candidate: PathCompletionCandidate) => {
        add(candidate);
        for (const directory of intermediateDirectoryCandidates(candidate)) {
            add(directory);
        }
    };

    for (const candidate of collectRelativePathCandidates(document, documents, fileSystem, options.extensionFilter)) {
        if (candidate.isDirectory) {
            add(candidate);
        } else {
            addFile(candidate);
        }
    }
    for (const candidate of collectAliasedPathCandidates(document, documents, fileSystem, pathContext, options.extensionFilter)) {
        if (candidate.isDirectory) {
            add(candidate);
        } else {
            addFile(candidate);
        }
    }
    const query = options.prefix ?? '';
    if (query.endsWith('/')) {
        for (const candidate of collectFolderSegmentCandidates(
            document,
            query,
            fileSystem,
            pathContext,
            options.extensionFilter
        )) {
            add(candidate);
        }
    }

    let candidates = [...byPath.values()];
    if (query.length > 0) {
        candidates = candidates.filter(candidate => pathMatchesQuery(candidate.path, query));
    }
    return candidates;
}

/** Directory prefixes for a file path, e.g. `../path/file.rq` → `../path/`. */
export function intermediateDirectoryPaths(filePath: string): string[] {
    const dirs: string[] = [];
    let index = 0;
    while (index < filePath.length) {
        const slash = filePath.indexOf('/', index);
        if (slash < 0 || slash === filePath.length - 1) {
            break;
        }
        const prefix = filePath.slice(0, slash + 1);
        // Skip `./`, runs of `../`, and bare alias roots like `@/`.
        const skip = prefix === '@/'
            || /^\.\/$/.test(prefix)
            || /^(\.\.\/)+$/.test(prefix);
        if (!skip) {
            dirs.push(prefix);
        }
        index = slash + 1;
    }
    return dirs;
}

function intermediateDirectoryCandidates(fileCandidate: PathCompletionCandidate): PathCompletionCandidate[] {
    const paths = intermediateDirectoryPaths(fileCandidate.path);
    if (paths.length === 0) {
        return [];
    }
    const result: PathCompletionCandidate[] = [];
    let dirUri = UriUtils.dirname(fileCandidate.targetUri);
    for (let i = paths.length - 1; i >= 0; i--) {
        result.push({
            path: paths[i]!,
            targetUri: dirUri,
            isDirectory: true
        });
        dirUri = UriUtils.dirname(dirUri);
    }
    return result;
}

function collectRelativePathCandidates(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    extensionFilter?: string
): PathCompletionCandidate[] {
    const sourceDir = UriUtils.dirname(document.uri);
    const dirname = sourceDir.toString();
    const candidates: PathCompletionCandidate[] = [];

    for (const doc of documents.all.toArray()) {
        if (UriUtils.equals(doc.uri, document.uri)) {
            continue;
        }
        if (extensionFilter && !doc.uri.path.endsWith(extensionFilter)) {
            continue;
        }
        candidates.push({
            path: relativeRqImportPath(document.uri, doc.uri),
            targetUri: doc.uri,
            isDirectory: false
        });
    }

    if (fileSystem.existsSync(sourceDir)) {
        collectDirectoryTree(sourceDir, dirname, undefined, undefined, candidates, extensionFilter, fileSystem);
    }
    return candidates;
}

function collectAliasedPathCandidates(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    pathContext: PathResolveContext,
    extensionFilter?: string
): PathCompletionCandidate[] {
    const config = resolveRqConfig(document, pathContext);
    const candidates: PathCompletionCandidate[] = [];
    for (const mapping of config.importRoots) {
        const importRoot = resolveImportRootUri(document, pathContext, mapping);
        if (!importRoot) {
            continue;
        }
        const aliasPrefix = `${mapping.alias}/`;
        const rootString = importRoot.toString();
        for (const doc of documents.all.toArray()) {
            if (UriUtils.equals(doc.uri, document.uri)) {
                continue;
            }
            if (extensionFilter && !doc.uri.path.endsWith(extensionFilter)) {
                continue;
            }
            const aliased = aliasedPathKeepExtension(rootString, aliasPrefix, doc.uri);
            if (aliased) {
                candidates.push({
                    path: aliased,
                    targetUri: doc.uri,
                    isDirectory: false
                });
            }
        }
        if (fileSystem.existsSync(importRoot)) {
            collectDirectoryTree(
                importRoot,
                rootString,
                aliasPrefix,
                rootString,
                candidates,
                extensionFilter,
                fileSystem
            );
        }
    }
    return candidates;
}

function collectDirectoryTree(
    directory: URI,
    relativeFrom: string,
    aliasPrefix: string | undefined,
    aliasRoot: string | undefined,
    candidates: PathCompletionCandidate[],
    extensionFilter: string | undefined,
    fileSystem: FileSystemProvider,
    depth = 0
): void {
    if (depth > 32) {
        return;
    }
    for (const entry of fileSystem.readDirectorySync(directory)) {
        const name = entry.uri.path.split('/').pop() ?? '';
        if (!name || name.startsWith('.')) {
            continue;
        }
        if (entry.isDirectory && SKIP_DIRECTORY_NAMES.has(name)) {
            continue;
        }
        if (entry.isDirectory) {
            const path = aliasPrefix && aliasRoot
                ? (() => {
                    const aliased = aliasedPathKeepExtension(aliasRoot, aliasPrefix, entry.uri);
                    return aliased ? `${aliased}/` : undefined;
                })()
                : `${relativePathKeepExtension(relativeFrom, entry.uri)}/`;
            if (path) {
                candidates.push({ path, targetUri: entry.uri, isDirectory: true });
            }
            collectDirectoryTree(
                entry.uri,
                relativeFrom,
                aliasPrefix,
                aliasRoot,
                candidates,
                extensionFilter,
                fileSystem,
                depth + 1
            );
            continue;
        }
        if (extensionFilter && !name.endsWith(extensionFilter)) {
            continue;
        }
        if (aliasPrefix && aliasRoot) {
            const aliased = aliasedPathKeepExtension(aliasRoot, aliasPrefix, entry.uri);
            if (aliased) {
                candidates.push({ path: aliased, targetUri: entry.uri, isDirectory: false });
            }
            continue;
        }
        candidates.push({
            path: relativePathKeepExtension(relativeFrom, entry.uri),
            targetUri: entry.uri,
            isDirectory: false
        });
    }
}

function collectFolderSegmentCandidates(
    document: LangiumDocument,
    prefix: string,
    fileSystem: FileSystemProvider,
    pathContext: PathResolveContext,
    extensionFilter?: string
): PathCompletionCandidate[] {
    const dirUri = resolveFolderPrefixUri(prefix, document, pathContext, fileSystem);
    if (!dirUri) {
        return [];
    }
    const candidates: PathCompletionCandidate[] = [];
    for (const entry of fileSystem.readDirectorySync(dirUri)) {
        const name = entry.uri.path.split('/').pop() ?? '';
        if (!name || name.startsWith('.')) {
            continue;
        }
        if (entry.isDirectory && SKIP_DIRECTORY_NAMES.has(name)) {
            continue;
        }
        if (entry.isDirectory) {
            candidates.push({
                path: `${prefix}${name}/`,
                targetUri: entry.uri,
                isDirectory: true
            });
            continue;
        }
        if (extensionFilter && !name.endsWith(extensionFilter)) {
            continue;
        }
        candidates.push({
            path: `${prefix}${name}`,
            targetUri: entry.uri,
            isDirectory: false
        });
    }
    return candidates;
}

function resolveFolderPrefixUri(
    prefix: string,
    document: LangiumDocument,
    pathContext: PathResolveContext,
    fileSystem: FileSystemProvider
): URI | undefined {
    const dirUri = resolveDocumentPathUri(prefix, document, pathContext);
    if (!fileSystem.existsSync(dirUri)) {
        return undefined;
    }
    const stat = fileSystem.statSync(dirUri);
    if (!stat.isDirectory) {
        return undefined;
    }
    return dirUri;
}

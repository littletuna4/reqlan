/**
 * Resolve qualified path + idea-pattern wildcard references.
 * rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
 */
import type { LangiumDocument, LangiumDocuments } from 'langium';
import { AstUtils, CstUtils, GrammarUtils, URI, UriUtils } from 'langium';
import type { Range } from 'vscode-languageserver';
import {
    isIdea,
    isModel,
    isOneLinerIdea,
    isWildcardReference,
    type IdeaDeclaration,
    type WildcardReference
} from './generated/ast.js';
import {
    matchImportRootMapping,
    resolveImportRootUri,
    resolveRqConfig,
    type PathResolveContext
} from './reqlan-path-resolve.js';
import { unquoteReqlanString } from './reqlan-quoted-strings.js';

export const REQLAN_OPEN_WILDCARD_COMMAND = 'reqlan.openWildcardReference';
export const REQLAN_WILDCARD_REFERENCE_AT_REQUEST = 'reqlan/wildcardReferenceAt';

export interface WildcardMatch {
    fileUri: string;
    ideaName: string;
    range?: Range;
}

/** Lightweight catalog entry for index-time expansion without full Langium docs. */
export interface WildcardIdeaCandidate {
    fileUri: string;
    /** Absolute or workspace path used for path-glob matching. */
    filePath: string;
    ideaName: string;
    range?: Range;
}

export interface WildcardReferenceArgs {
    pathPattern: string;
    ideaPattern: string;
    fromUri: string;
}

export function pathHasGlobMeta(path: string): boolean {
    return /[*?]/.test(path) || path.includes('**');
}

export function ideaHasGlobMeta(name: string): boolean {
    return /[*?]/.test(name);
}

/** Convert a shell-style glob to an anchored RegExp. */
export function globToRegExp(glob: string, mode: 'path' | 'name' = 'name'): RegExp {
    let pattern = '';
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i]!;
        if (ch === '*' && glob[i + 1] === '*') {
            // ** optionally followed by / matches across path segments
            if (glob[i + 2] === '/') {
                pattern += '(?:.*/)?';
                i += 2;
            } else {
                pattern += '.*';
                i += 1;
            }
            continue;
        }
        if (ch === '*') {
            pattern += mode === 'path' ? '[^/]*' : '.*';
            continue;
        }
        if (ch === '?') {
            pattern += mode === 'path' ? '[^/]' : '.';
            continue;
        }
        if ('\\^$+{}[]()|/.'.includes(ch)) {
            pattern += `\\${ch}`;
            continue;
        }
        pattern += ch;
    }
    return new RegExp(`^${pattern}$`);
}

export function wildcardReferenceCommandTarget(args: WildcardReferenceArgs): string {
    return `command:${REQLAN_OPEN_WILDCARD_COMMAND}?${encodeURIComponent(JSON.stringify([args]))}`;
}

export function wildcardReferenceLabel(pathPattern: string, ideaPattern: string): string {
    return `${pathPattern}.${ideaPattern}`;
}

export function parseWildcardPathPattern(pathPatternQuoted: string): string {
    return unquoteReqlanString(pathPatternQuoted);
}

/**
 * Resolve the path glob against the document directory / import-root alias,
 * returning a regex that matches absolute file paths (posix-style).
 */
export function pathPatternToAbsoluteRegex(
    pathPatternQuoted: string,
    document: LangiumDocument,
    context?: PathResolveContext
): RegExp {
    const raw = parseWildcardPathPattern(pathPatternQuoted);
    const config = resolveRqConfig(document, context);
    const matched = matchImportRootMapping(raw, config.importRoots);
    let absoluteGlob: string;
    if (matched) {
        const importRoot = resolveImportRootUri(document, context, matched.mapping);
        const rootPath = importRoot
            ? uriToPath(importRoot)
            : uriToPath(UriUtils.dirname(document.uri));
        absoluteGlob = joinGlobPath(rootPath, matched.remainder);
    } else if (raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw)) {
        absoluteGlob = normalizePathSeparators(raw);
    } else {
        absoluteGlob = joinGlobPath(uriToPath(UriUtils.dirname(document.uri)), raw);
    }
    return globToRegExp(normalizePathSeparators(absoluteGlob), 'path');
}

export function collectIdeaCandidatesFromDocuments(
    documents: Iterable<LangiumDocument>
): WildcardIdeaCandidate[] {
    const candidates: WildcardIdeaCandidate[] = [];
    for (const document of documents) {
        const model = document.parseResult.value;
        if (!isModel(model)) {
            continue;
        }
        const fileUri = document.uri.toString();
        const filePath = uriToPath(document.uri);
        for (const idea of collectIdeas(model)) {
            const nameNode = GrammarUtils.findNodeForProperty(idea.$cstNode, 'name');
            candidates.push({
                fileUri,
                filePath,
                ideaName: idea.name,
                range: nameNode?.range
            });
        }
    }
    return candidates;
}

export function matchWildcardAgainstCatalog(
    pathPatternQuoted: string,
    ideaPattern: string,
    document: LangiumDocument,
    candidates: readonly WildcardIdeaCandidate[],
    context?: PathResolveContext
): WildcardMatch[] {
    const pathRegex = pathPatternToAbsoluteRegex(pathPatternQuoted, document, context);
    const ideaRegex = globToRegExp(ideaPattern, 'name');
    const matches: WildcardMatch[] = [];
    for (const candidate of candidates) {
        const path = normalizePathSeparators(candidate.filePath);
        if (!pathRegex.test(path)) {
            continue;
        }
        if (!ideaRegex.test(candidate.ideaName)) {
            continue;
        }
        matches.push({
            fileUri: candidate.fileUri,
            ideaName: candidate.ideaName,
            range: candidate.range
        });
    }
    return matches.sort((left, right) => {
        const byFile = left.fileUri.localeCompare(right.fileUri);
        return byFile !== 0 ? byFile : left.ideaName.localeCompare(right.ideaName);
    });
}

export function resolveWildcardReferenceMatches(
    reference: WildcardReference,
    documents: LangiumDocuments | Iterable<LangiumDocument>,
    context?: PathResolveContext
): WildcardMatch[] {
    const document = AstUtils.getDocument(reference);
    const iterable = isLangiumDocuments(documents) ? documents.all : documents;
    const candidates = collectIdeaCandidatesFromDocuments(iterable);
    return matchWildcardAgainstCatalog(
        reference.pathPattern,
        reference.ideaPattern,
        document,
        candidates,
        context
    );
}

export function wildcardArgsFromReference(reference: WildcardReference): WildcardReferenceArgs {
    const document = AstUtils.getDocument(reference);
    return {
        pathPattern: parseWildcardPathPattern(reference.pathPattern),
        ideaPattern: reference.ideaPattern,
        fromUri: document.uri.toString()
    };
}

export function findWildcardReferenceAtPosition(
    document: LangiumDocument,
    offset: number
): WildcardReference | undefined {
    const root = document.parseResult.value.$cstNode;
    if (!root) {
        return undefined;
    }
    let current = CstUtils.findLeafNodeAtOffset(root, offset)?.astNode;
    while (current) {
        if (isWildcardReference(current)) {
            return current;
        }
        if ('target' in current && isWildcardReference((current as { target?: unknown }).target)) {
            return (current as { target: WildcardReference }).target;
        }
        current = current.$container;
    }
    return undefined;
}

function collectIdeas(model: { elements?: unknown[] }): IdeaDeclaration[] {
    const ideas: IdeaDeclaration[] = [];
    for (const node of AstUtils.streamAst(model as Parameters<typeof AstUtils.streamAst>[0])) {
        if (isIdea(node) || isOneLinerIdea(node)) {
            ideas.push(node);
        }
    }
    return ideas;
}

function isLangiumDocuments(value: unknown): value is LangiumDocuments {
    return typeof value === 'object' && value !== null && 'all' in value;
}

function uriToPath(uri: URI): string {
    if (uri.scheme === 'file') {
        return normalizePathSeparators(uri.fsPath ?? uri.path);
    }
    return normalizePathSeparators(uri.path);
}

function normalizePathSeparators(path: string): string {
    return path.replace(/\\/g, '/');
}

function joinGlobPath(base: string, relative: string): string {
    const left = normalizePathSeparators(base).replace(/\/+$/, '');
    const right = normalizePathSeparators(relative).replace(/^\/+/, '');
    return normalizeGlobPath(`${left}/${right}`);
}

/** Collapse `.` / `..` segments without expanding glob metacharacters. */
function normalizeGlobPath(path: string): string {
    const absolute = path.startsWith('/');
    const parts = path.split('/');
    const out: string[] = [];
    for (const part of parts) {
        if (!part || part === '.') {
            continue;
        }
        if (part === '..') {
            if (out.length > 0 && out[out.length - 1] !== '..' && !/[*?]/.test(out[out.length - 1]!)) {
                out.pop();
            } else if (!absolute) {
                out.push(part);
            }
            continue;
        }
        out.push(part);
    }
    const joined = out.join('/');
    return absolute ? `/${joined}` : joined;
}

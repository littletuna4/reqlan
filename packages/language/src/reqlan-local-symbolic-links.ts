/**
 * Outbound idea document links from path-local Rust extract plus a depth-1 neighbor parse.
 * Does not wait on Langium workspace linking.
 * Host native extract is cached by URI plus text fingerprint so links and diagnostics
 * share one parse of this buffer.
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".outbound_one_hop]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_hot_path]
 * rq:["../../../reqlan rq/extension/language/support/features-imports.rq".implicit_file_extension]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".unresolved_reference_diagnostics]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_underline_syntax_align]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".aliased_from_import_ctrl_click]
 */
import type { LangiumDocument, LangiumDocuments } from 'langium';
import { URI } from 'langium';
import type { Range } from 'vscode-languageserver';
import {
    analyzeLocalSymbolic,
    type LocalSymbolicDocument,
    type LocalSymbolicEdge,
    type LocalSymbolicImportRoot
} from '@reqlan/analytical/core';
import type { ResolvedFileLink } from './reqlan-file-link-resolver.js';
import {
    ideaRangeFromNeighbor,
    neighborIdea,
    parseNeighborDocument,
    fingerprintText
} from './reqlan-neighbor-parse.js';
import { importPathOf } from './reqlan-import-bindings.js';
import {
    neighborTargetCandidateUris,
    resolveImportCandidateUris,
    resolveNeighborTargetUri
} from './reqlan-imports.js';
import {
    isModel
} from './generated/ast.js';
import { unquoteReqlanString } from './reqlan-quoted-strings.js';
import {
    resolveImportRootUri,
    resolveRqConfig,
    type PathResolveContext
} from './reqlan-path-resolve.js';
import { utf8ByteOffsetToUtf16 } from './reqlan-utf8-lsp-offset.js';

interface HostExtractCacheEntry {
    readonly fingerprint: string;
    readonly extracted: LocalSymbolicDocument;
}

const hostExtractCache = new Map<string, HostExtractCacheEntry>();
let extractCount = 0;

export function clearLocalSymbolicExtractCache(): void {
    hostExtractCache.clear();
    extractCount = 0;
}

export function localSymbolicExtractCount(): number {
    return extractCount;
}

function importRootsKey(roots: readonly LocalSymbolicImportRoot[]): string {
    return roots.map(root => `${root.alias}=${root.root ?? ''}`).join('|');
}

function hostExtractFingerprint(
    text: string,
    roots: readonly LocalSymbolicImportRoot[]
): string {
    return `${fingerprintText(text)}:${importRootsKey(roots)}`;
}

export function importRootsForLocalSymbolic(
    document: LangiumDocument,
    context?: PathResolveContext
): LocalSymbolicImportRoot[] {
    const config = resolveRqConfig(document, context);
    return config.importRoots.map(mapping => {
        const root: LocalSymbolicImportRoot = { alias: mapping.alias };
        const rootUri = resolveImportRootUri(document, context, mapping);
        if (rootUri) {
            root.root = rootUri.fsPath;
        }
        return root;
    });
}

export function analyzeDocumentLocalSymbolic(
    document: LangiumDocument,
    context?: PathResolveContext
): LocalSymbolicDocument {
    const roots = importRootsForLocalSymbolic(document, context);
    const text = document.textDocument.getText();
    const uriKey = document.uri.toString();
    const fingerprint = hostExtractFingerprint(text, roots);
    const cached = hostExtractCache.get(uriKey);
    if (cached && cached.fingerprint === fingerprint) {
        return cached.extracted;
    }
    const extracted = analyzeLocalSymbolic(uriKey, text, roots);
    extractCount += 1;
    hostExtractCache.set(uriKey, { fingerprint, extracted });
    return extracted;
}

/** Cached extract only. Does not parse. Used by relink to avoid a workspace-wide native walk. */
export function peekLocalSymbolicExtract(
    document: LangiumDocument
): LocalSymbolicDocument | undefined {
    return hostExtractCache.get(document.uri.toString())?.extracted;
}

/**
 * True when this document's outbound paths include a changed URI.
 * Uses cached extract edges plus import specifiers. Does not parse.
 */
export function documentOutboundTouchesChangedUris(
    document: LangiumDocument,
    changedUris: Set<string>,
    context?: PathResolveContext
): boolean {
    if (changedUris.size === 0) {
        return false;
    }
    const extracted = peekLocalSymbolicExtract(document);
    if (extracted) {
        for (const edge of extracted.edges) {
            const filePart = edge.targetFile ?? filePartFromTargetId(edge.targetId);
            if (!filePart || isSameIndexedUri(filePart, document.uri)) {
                continue;
            }
            if (filePartTouchesChangedUris(filePart, document, changedUris, context)) {
                return true;
            }
        }
    }
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return false;
    }
    for (const importDecl of model.imports) {
        const rawPath = importPathOf(importDecl);
        const path = rawPath ? unquoteReqlanString(rawPath) : undefined;
        if (!path) {
            continue;
        }
        for (const uri of resolveImportCandidateUris(path, document, context)) {
            if (changedSetHasUri(changedUris, uri)) {
                return true;
            }
        }
    }
    return false;
}

function filePartFromTargetId(targetId: string | undefined): string | undefined {
    if (!targetId) {
        return undefined;
    }
    const hash = targetId.lastIndexOf('#');
    return hash >= 0 ? targetId.slice(0, hash) : targetId;
}

function filePartTouchesChangedUris(
    filePart: string,
    document: LangiumDocument,
    changedUris: Set<string>,
    context?: PathResolveContext
): boolean {
    if (changedUris.has(filePart)) {
        return true;
    }
    try {
        for (const uri of neighborTargetCandidateUris(filePart, document, context)) {
            if (changedSetHasUri(changedUris, uri)) {
                return true;
            }
        }
    } catch {
        // filePart may already be a URI
    }
    try {
        return changedSetHasUri(changedUris, URI.parse(filePart));
    } catch {
        return false;
    }
}

function changedSetHasUri(changedUris: Set<string>, uri: URI): boolean {
    if (changedUris.has(uri.toString())) {
        return true;
    }
    if (uri.scheme !== 'file' || uri.fsPath.length === 0) {
        return false;
    }
    try {
        return changedUris.has(URI.file(uri.fsPath).toString());
    } catch {
        return false;
    }
}

/**
 * Idea outbound links for the open buffer. File / wildcard refs stay on the FS / AST pass.
 * Unresolved edges and missing cross-file targets must not become document links — those
 * look like happy references while Ctrl+click cannot navigate.
 */
export function collectLocalSymbolicOutboundLinks(
    document: LangiumDocument,
    context?: PathResolveContext,
    documents?: LangiumDocuments
): ResolvedFileLink[] {
    const extracted = analyzeDocumentLocalSymbolic(document, context);
    const links: ResolvedFileLink[] = [];
    for (const edge of extracted.edges) {
        if (edge.kind !== 'references' || edge.isResolved === false) {
            continue;
        }
        const link = ideaLinkFromEdge(document, extracted, edge, context, documents);
        if (link) {
            links.push(link);
        }
    }
    return dropContainedOverlappingLinks(document, links);
}

export function findLocalSymbolicDefinition(
    document: LangiumDocument,
    offset: number,
    context?: PathResolveContext,
    documents?: LangiumDocuments
): { targetUri: string; targetRange?: Range; sourceRange: Range } | undefined {
    const extracted = analyzeDocumentLocalSymbolic(document, context);
    let best: { targetUri: string; targetRange?: Range; sourceRange: Range; span: number } | undefined;
    for (const edge of extracted.edges) {
        if (edge.kind !== 'references' || edge.isResolved === false) {
            continue;
        }
        const sourceRange = ideaNameRangeFromEdge(document, edge);
        if (!sourceRange) {
            continue;
        }
        const start = document.textDocument.offsetAt(sourceRange.start);
        const end = document.textDocument.offsetAt(sourceRange.end);
        if (offset < start || offset >= end) {
            continue;
        }
        const span = end - start;
        if (best && span <= best.span) {
            continue;
        }
        const target = resolveIdeaTarget(document, extracted, edge, context, documents);
        if (!target) {
            continue;
        }
        best = {
            targetUri: target.targetUri,
            targetRange: target.targetRange,
            sourceRange,
            span
        };
    }
    if (!best) {
        return undefined;
    }
    return {
        targetUri: best.targetUri,
        targetRange: best.targetRange,
        sourceRange: best.sourceRange
    };
}

function ideaLinkFromEdge(
    document: LangiumDocument,
    extracted: LocalSymbolicDocument,
    edge: LocalSymbolicEdge,
    context?: PathResolveContext,
    documents?: LangiumDocuments
): ResolvedFileLink | undefined {
    const sourceRange = ideaNameRangeFromEdge(document, edge);
    if (!sourceRange) {
        return undefined;
    }
    const target = resolveIdeaTarget(document, extracted, edge, context, documents);
    if (!target) {
        return undefined;
    }
    return {
        sourceRange,
        targetUri: target.targetUri,
        targetRange: target.targetRange,
        resolution: 'file'
    };
}

function resolveIdeaTarget(
    document: LangiumDocument,
    extracted: LocalSymbolicDocument,
    edge: LocalSymbolicEdge,
    context?: PathResolveContext,
    documents?: LangiumDocuments
): { targetUri: string; targetRange?: Range } | undefined {
    const targetId = edge.targetId;
    if (!targetId || edge.isResolved === false) {
        return undefined;
    }
    const hash = targetId.lastIndexOf('#');
    const filePart = hash >= 0 ? targetId.slice(0, hash) : targetId;
    const ideaName = hash >= 0 ? targetId.slice(hash + 1) : undefined;
    if (!filePart) {
        return undefined;
    }

    if (filePart === document.uri.toString() || isSameIndexedUri(filePart, document.uri)) {
        const idea = ideaName
            ? extracted.ideas.find(entry => entry.name === ideaName)
            : undefined;
        if (ideaName && !idea) {
            return undefined;
        }
        return {
            targetUri: document.uri.toString(),
            targetRange: idea
                ? {
                    start: { line: Math.max(0, idea.lineStart), character: 0 },
                    end: { line: Math.max(0, idea.lineEnd), character: 0 }
                }
                : undefined
        };
    }

    const targetUri = resolveNeighborTargetUri(
        filePart,
        document,
        documents,
        context?.fileSystem,
        context
    );
    if (!ideaName) {
        return undefined;
    }
    const neighbor = parseNeighborDocument(targetUri, documents, context?.fileSystem);
    const idea = neighbor ? neighborIdea(neighbor, ideaName) : undefined;
    if (!idea) {
        return undefined;
    }
    return { targetUri: targetUri.toString(), targetRange: ideaRangeFromNeighbor(idea) };
}

export function isSameIndexedUri(filePart: string, documentUri: URI): boolean {
    if (filePart === documentUri.toString()) {
        return true;
    }
    try {
        return URI.file(filePart).toString() === documentUri.toString()
            || URI.parse(filePart).toString() === documentUri.toString();
    } catch {
        return false;
    }
}

function rangeFromEdgeOffsets(
    document: LangiumDocument,
    edge: LocalSymbolicEdge
): Range | undefined {
    if (edge.sourceOffsetStart === undefined || edge.sourceOffsetEnd === undefined) {
        return undefined;
    }
    const startByte = edge.sourceOffsetStart;
    const endByte = edge.sourceOffsetEnd;
    if (endByte < startByte) {
        return undefined;
    }
    const text = document.textDocument.getText();
    // Native spans are UTF-8 bytes; TextDocument.positionAt is UTF-16.
    const start = utf8ByteOffsetToUtf16(text, startByte);
    const end = utf8ByteOffsetToUtf16(text, endByte);
    return {
        start: document.textDocument.positionAt(start),
        end: document.textDocument.positionAt(end)
    };
}

/** Prefer the idea-name token inside `[…]` / `[[…]]`, matching Langium `$refNode` ranges. */
export function ideaNameRangeFromEdge(
    document: LangiumDocument,
    edge: LocalSymbolicEdge
): Range | undefined {
    const full = rangeFromEdgeOffsets(document, edge);
    if (!full) {
        return undefined;
    }
    const text = document.textDocument.getText(full);
    const token = writtenIdeaTokenInReferenceSpan(text) ?? edge.label;
    if (!token) {
        return full;
    }
    const index = wholeTokenIndex(text, token);
    if (index < 0) {
        return full;
    }
    const startOffset = document.textDocument.offsetAt(full.start) + index;
    return {
        start: document.textDocument.positionAt(startOffset),
        end: document.textDocument.positionAt(startOffset + token.length)
    };
}

/**
 * Idea name as written in a bracket or wikilink span.
 * `[ontology-simulation]` → `ontology-simulation`, not a suffix of that alias.
 */
export function writtenIdeaTokenInReferenceSpan(text: string): string | undefined {
    const trimmed = text.trim();
    let inner = trimmed;
    if (inner.startsWith('[[') && inner.endsWith(']]')) {
        inner = inner.slice(2, -2).trim();
    } else if (inner.startsWith('[') && inner.endsWith(']')) {
        inner = inner.slice(1, -1).trim();
    }
    if (inner.length === 0) {
        return undefined;
    }
    const quoted = inner.match(/^["'](?:\\.|[^"'\\])*["']\s*\.\s*(.+)$/);
    if (quoted?.[1]) {
        return quoted[1];
    }
    const dot = inner.lastIndexOf('.');
    if (dot >= 0) {
        return inner.slice(dot + 1);
    }
    return inner;
}

function isIdeaNameChar(ch: string | undefined): boolean {
    if (!ch) {
        return false;
    }
    return /[A-Za-z0-9_-]/.test(ch);
}

/** Reject `simulation` as a suffix of `ontology-simulation`. */
function wholeTokenIndex(text: string, token: string): number {
    let from = text.length;
    while (from >= token.length) {
        const index = text.lastIndexOf(token, from - 1);
        if (index < 0) {
            return -1;
        }
        const before = index > 0 ? text[index - 1] : undefined;
        const after = text[index + token.length];
        if (!isIdeaNameChar(before) && !isIdeaNameChar(after)) {
            return index;
        }
        from = index;
    }
    return -1;
}

function dropContainedOverlappingLinks(
    document: LangiumDocument,
    links: ResolvedFileLink[]
): ResolvedFileLink[] {
    const withSpan = links.map(link => {
        const start = document.textDocument.offsetAt(link.sourceRange.start);
        const end = document.textDocument.offsetAt(link.sourceRange.end);
        return { link, start, end, span: end - start };
    });
    withSpan.sort((left, right) => right.span - left.span);
    const kept: typeof withSpan = [];
    for (const candidate of withSpan) {
        const contained = kept.some(existing =>
            candidate.start >= existing.start && candidate.end <= existing.end
        );
        if (contained) {
            continue;
        }
        kept.push(candidate);
    }
    return kept.map(entry => entry.link);
}

/**
 * Outbound idea document links from path-local Rust extract plus a depth-1 neighbor parse.
 * Does not wait on Langium workspace linking.
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".outbound_one_hop]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".unresolved_reference_diagnostics]
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
    parseNeighborDocument
} from './reqlan-neighbor-parse.js';
import {
    resolveDocumentPathUri,
    resolveRqConfig,
    type PathResolveContext
} from './reqlan-path-resolve.js';

export function importRootsForLocalSymbolic(
    document: LangiumDocument,
    context?: PathResolveContext
): LocalSymbolicImportRoot[] {
    const config = resolveRqConfig(document, context);
    return config.importRoots.map(mapping => {
        const root: LocalSymbolicImportRoot = { alias: mapping.alias };
        if (mapping.rootUri) {
            root.root = mapping.rootUri.fsPath;
        }
        return root;
    });
}

export function analyzeDocumentLocalSymbolic(
    document: LangiumDocument,
    context?: PathResolveContext
): LocalSymbolicDocument {
    return analyzeLocalSymbolic(
        document.uri.toString(),
        document.textDocument.getText(),
        importRootsForLocalSymbolic(document, context)
    );
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
    return links;
}

export function findLocalSymbolicDefinition(
    document: LangiumDocument,
    offset: number,
    context?: PathResolveContext,
    documents?: LangiumDocuments
): { targetUri: string; targetRange?: Range; sourceRange: Range } | undefined {
    const extracted = analyzeDocumentLocalSymbolic(document, context);
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
        const target = resolveIdeaTarget(document, extracted, edge, context, documents);
        if (!target) {
            return undefined;
        }
        return {
            targetUri: target.targetUri,
            targetRange: target.targetRange,
            sourceRange
        };
    }
    return undefined;
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

    const targetUri = resolveDocumentPathUri(filePart, document, context);
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
    const start = edge.sourceOffsetStart;
    const end = edge.sourceOffsetEnd;
    if (end < start) {
        return undefined;
    }
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
    const label = edge.label;
    if (!label) {
        return full;
    }
    const text = document.textDocument.getText(full);
    const index = text.lastIndexOf(label);
    if (index < 0) {
        return full;
    }
    const startOffset = document.textDocument.offsetAt(full.start) + index;
    return {
        start: document.textDocument.positionAt(startOffset),
        end: document.textDocument.positionAt(startOffset + label.length)
    };
}

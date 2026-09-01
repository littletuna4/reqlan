/**
 * Bidirectional reference helpers for local symbolic analysis.
 * rq:["../../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 */
import type { EdgeKind, IdeaSummary, ReferenceListRow } from './types.js';
import { FILTER_NOT_PRESENT } from './filter-specials.js';
import type {
    LocalSymbolicDocument,
    LocalSymbolicEdge,
    LocalSymbolicIdea
} from '../native/parse-source.js';

export interface LocalSymbolicIdeaReferences {
    outbound: LocalSymbolicEdge[];
    inbound: LocalSymbolicEdge[];
}

/**
 * Outbound edges from `ideaId` and same-file inbound backlinks targeting it.
 */
export function localSymbolicReferencesForIdea(
    doc: LocalSymbolicDocument,
    ideaId: string
): LocalSymbolicIdeaReferences {
    const outbound = doc.edges.filter(edge => edge.sourceId === ideaId);
    const inbound = (doc.inbound ?? []).filter(edge => edge.targetId === ideaId);
    return { outbound, inbound };
}

export function localSymbolicIdeaById(
    doc: LocalSymbolicDocument,
    ideaId: string
): LocalSymbolicIdea | undefined {
    return doc.ideas.find(idea => idea.id === ideaId);
}

export function localSymbolicIdeaSummary(idea: LocalSymbolicIdea): IdeaSummary {
    const kind: IdeaSummary['kind'] =
        idea.kind === 'oneliner' || idea.kind === 'ideaset' || idea.kind === 'block'
            ? idea.kind
            : 'block';
    return {
        id: idea.id,
        name: idea.name,
        kind,
        fileUri: idea.fileUri,
        lineStart: idea.lineStart,
        summary: idea.summary,
        statusKey: FILTER_NOT_PRESENT,
        tags: [],
        tagsKeys: [FILTER_NOT_PRESENT]
    };
}

/**
 * Build reference-list rows for one idea from a local symbolic document.
 * Inbound labels use the referencer name (not the edge target label).
 */
export function localSymbolicReferenceRowsForIdea(
    doc: LocalSymbolicDocument,
    ideaId: string
): ReferenceListRow[] {
    const { outbound, inbound } = localSymbolicReferencesForIdea(doc, ideaId);
    const byId = new Map(doc.ideas.map(idea => [idea.id, idea]));
    const rows: ReferenceListRow[] = [];

    for (const edge of outbound) {
        const target = edge.targetId ? byId.get(edge.targetId) : undefined;
        const targetName = target?.name ?? edge.label ?? edge.targetFile ?? 'unknown';
        const targetPath = target?.fileUri ?? edge.targetFile ?? '';
        rows.push({
            edgeId: edge.id,
            direction: 'outbound',
            kind: edge.kind as EdgeKind,
            label: edge.label ?? targetName,
            targetName,
            targetPath,
            targetLine: target?.lineStart,
            sourceLine: edge.sourceLine,
            snippet: edge.snippet,
            isResolved: edge.isResolved !== false && Boolean(edge.targetId || edge.targetFile),
            sourceIdeaId: edge.sourceId,
            targetIdeaId: edge.targetId
        });
    }

    for (const edge of inbound) {
        const source = byId.get(edge.sourceId);
        const referencerName = source?.name ?? edge.sourceId.split('#').pop() ?? 'unknown';
        rows.push({
            edgeId: edge.id,
            direction: 'inbound',
            kind: edge.kind as EdgeKind,
            label: referencerName,
            targetName: referencerName,
            targetPath: source?.fileUri ?? doc.fileUri,
            targetLine: source?.lineStart,
            sourceLine: edge.sourceLine,
            snippet: edge.snippet,
            isResolved: edge.isResolved !== false && Boolean(edge.targetId),
            sourceIdeaId: edge.sourceId,
            targetIdeaId: edge.targetId
        });
    }

    return rows;
}

/**
 * Merge indexed rows with live local-symbolic rows. Indexed rows win on the same
 * direction+edgeId key; local-only same-file inbound/outbound are appended.
 * rq:["../../../../reqlan rq/indexer/indexer.rq".local_symbolic_sidebar]
 */
export function mergeReferenceRows(
    indexed: readonly ReferenceListRow[],
    local: readonly ReferenceListRow[]
): ReferenceListRow[] {
    const seen = new Set<string>();
    const merged: ReferenceListRow[] = [];
    for (const row of indexed) {
        const key = `${row.direction}:${row.edgeId}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        merged.push(row);
    }
    for (const row of local) {
        const key = `${row.direction}:${row.edgeId}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        merged.push(row);
    }
    return merged;
}

/**
 * Dedupe idea summaries by id, preserving first-seen order.
 */
export function dedupeIdeaSummaries(ideas: readonly IdeaSummary[]): IdeaSummary[] {
    const seen = new Set<string>();
    const out: IdeaSummary[] = [];
    for (const idea of ideas) {
        if (seen.has(idea.id)) {
            continue;
        }
        seen.add(idea.id);
        out.push(idea);
    }
    return out;
}

export function localSymbolicNeighborIdeas(
    doc: LocalSymbolicDocument,
    ideaId: string
): { inbound: IdeaSummary[]; outbound: IdeaSummary[] } {
    const { outbound, inbound } = localSymbolicReferencesForIdea(doc, ideaId);
    const byId = new Map(doc.ideas.map(idea => [idea.id, idea]));
    const outboundIdeas: IdeaSummary[] = [];
    const inboundIdeas: IdeaSummary[] = [];
    const seenOut = new Set<string>();
    const seenIn = new Set<string>();

    for (const edge of outbound) {
        if (!edge.targetId || seenOut.has(edge.targetId)) {
            continue;
        }
        const idea = byId.get(edge.targetId);
        if (!idea) {
            continue;
        }
        seenOut.add(edge.targetId);
        outboundIdeas.push(localSymbolicIdeaSummary(idea));
    }
    for (const edge of inbound) {
        if (seenIn.has(edge.sourceId)) {
            continue;
        }
        const idea = byId.get(edge.sourceId);
        if (!idea) {
            continue;
        }
        seenIn.add(edge.sourceId);
        inboundIdeas.push(localSymbolicIdeaSummary(idea));
    }
    return { inbound: inboundIdeas, outbound: outboundIdeas };
}

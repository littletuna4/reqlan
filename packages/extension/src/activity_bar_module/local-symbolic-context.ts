/**
 * Live local-symbolic overlay for activity-bar references.
 * rq:["../../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../../reqlan rq/indexer/indexer.rq".local_symbolic_sidebar]
 */
import {
    analyzeLocalSymbolic,
    dedupeIdeaSummaries,
    localSymbolicNeighborIdeas,
    localSymbolicReferenceRowsForIdea,
    mergeReferenceRows,
    type IdeaSummary,
    type LocalSymbolicDocument,
    type ReferenceListRow
} from '@reqlan/analytical';

export function analyzeBufferLocalSymbolic(
    fileUri: string,
    source: string
): LocalSymbolicDocument | undefined {
    if (!fileUri.endsWith('.rq') || source.length === 0) {
        return undefined;
    }
    try {
        return analyzeLocalSymbolic(fileUri, source);
    } catch {
        return undefined;
    }
}

export function mergeLocalSymbolicReferenceRows(
    indexed: readonly ReferenceListRow[],
    fileUri: string,
    source: string | undefined,
    ideaId: string
): ReferenceListRow[] {
    if (!source) {
        return [...indexed];
    }
    const doc = analyzeBufferLocalSymbolic(fileUri, source);
    if (!doc) {
        return [...indexed];
    }
    return mergeReferenceRows(indexed, localSymbolicReferenceRowsForIdea(doc, ideaId));
}

export function mergeLocalSymbolicNeighborIdeas(
    indexedInbound: readonly IdeaSummary[],
    indexedOutbound: readonly IdeaSummary[],
    fileUri: string,
    source: string | undefined,
    ideaId: string
): { inbound: IdeaSummary[]; outbound: IdeaSummary[] } {
    if (!source) {
        return {
            inbound: dedupeIdeaSummaries(indexedInbound),
            outbound: dedupeIdeaSummaries(indexedOutbound)
        };
    }
    const doc = analyzeBufferLocalSymbolic(fileUri, source);
    if (!doc) {
        return {
            inbound: dedupeIdeaSummaries(indexedInbound),
            outbound: dedupeIdeaSummaries(indexedOutbound)
        };
    }
    const local = localSymbolicNeighborIdeas(doc, ideaId);
    return {
        inbound: dedupeIdeaSummaries([...indexedInbound, ...local.inbound]),
        outbound: dedupeIdeaSummaries([...indexedOutbound, ...local.outbound])
    };
}

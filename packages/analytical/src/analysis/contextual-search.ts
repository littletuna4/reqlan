/**
 * Context-biased search: resolve path/idea refs and re-rank by hop distance.
 * rq:["../../../../reqlan rq/core_analysis/search.rq".contextual_search]
 */
import { hopDistancesFromCenters } from '../core/context-signals.js';
import { ideaId, type EdgeRecord, type IdeaSummary, type SemanticMatch } from '../core/types.js';

/** Unreachable ideas use this hop for decay (same as 8 hops → score / 256). */
export const CONTEXT_UNREACHABLE_HOP = 8;

export interface SearchContextStore {
    getIdea(id: string): Promise<IdeaSummary | undefined>;
    getIdeasInFile(fileUri: string): Promise<IdeaSummary[]>;
    searchByNameOrSummary(query: string): Promise<IdeaSummary[]>;
    getAllEdges(): Promise<EdgeRecord[]>;
}

export interface SearchContextIndex {
    toIndexedUri(filePathOrUri: string): string;
}

/** Strip optional `[…]` wrappers from a context token. */
export function normalizeContextRef(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length >= 2) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}

/**
 * Resolve relative paths / `path#idea` / bare idea names to unique idea ids.
 * Unknown tokens are skipped.
 */
export async function resolveSearchContextRefs(
    index: SearchContextIndex,
    store: SearchContextStore,
    refs: readonly string[]
): Promise<string[]> {
    const ids = new Set<string>();
    for (const raw of refs) {
        const token = normalizeContextRef(raw);
        if (!token) {
            continue;
        }

        const hashIndex = token.lastIndexOf('#');
        if (hashIndex > 0) {
            const pathPart = token.slice(0, hashIndex);
            const namePart = token.slice(hashIndex + 1);
            if (pathPart && namePart) {
                const id = ideaId(index.toIndexedUri(pathPart), namePart);
                const idea = await store.getIdea(id);
                if (idea) {
                    ids.add(idea.id);
                }
            }
            continue;
        }

        if (token.toLowerCase().endsWith('.rq')) {
            const fileUri = index.toIndexedUri(token);
            for (const idea of await store.getIdeasInFile(fileUri)) {
                ids.add(idea.id);
            }
            continue;
        }

        // Try as indexed file path even without .rq suffix.
        const asFile = index.toIndexedUri(token);
        const inFile = await store.getIdeasInFile(asFile);
        if (inFile.length > 0) {
            for (const idea of inFile) {
                ids.add(idea.id);
            }
            continue;
        }

        const candidates = await store.searchByNameOrSummary(token);
        for (const idea of candidates) {
            if (idea.name === token) {
                ids.add(idea.id);
            }
        }
    }
    return [...ids];
}

/** Apply `finalScore = textScore * 2^(-minHop)` and append context reasons. */
export function applyContextDistanceScoring(
    matches: SemanticMatch[],
    distances: Map<string, number>
): SemanticMatch[] {
    return matches.map(match => {
        const hop = distances.get(match.idea.id);
        const effectiveHop = hop === undefined ? CONTEXT_UNREACHABLE_HOP : hop;
        const reason = hop === undefined ? 'context:unreachable' : `context:${hop} hops`;
        return {
            ...match,
            score: match.score * Math.pow(0.5, effectiveHop),
            reasons: [...match.reasons, reason]
        };
    });
}

/**
 * Load edges, compute multi-source hop distances, and re-rank semantic matches.
 * Returns matches unchanged when `contextIdeaIds` is empty.
 */
export async function rerankMatchesWithContext(
    store: SearchContextStore,
    matches: SemanticMatch[],
    contextIdeaIds: readonly string[]
): Promise<SemanticMatch[]> {
    if (contextIdeaIds.length === 0 || matches.length === 0) {
        return matches;
    }
    const edges = await store.getAllEdges();
    const hopEdges = edges
        .filter((edge): edge is EdgeRecord & { targetId: string } => Boolean(edge.targetId))
        .map(edge => ({ sourceId: edge.sourceId, targetId: edge.targetId }));
    const distances = hopDistancesFromCenters(contextIdeaIds, hopEdges);
    return applyContextDistanceScoring(matches, distances).sort((left, right) => right.score - left.score);
}

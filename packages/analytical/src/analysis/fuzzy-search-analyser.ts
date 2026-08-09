/**
 * Analyser entry for fuzzy idea search.
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
 */
import type { Analyser } from './analyser-registry.js';
import { filterAndScoreIdeasAsync, type FuzzySearchHit } from './fuzzy-search.js';

export interface FuzzySearchParams {
    query: string;
    /** Cap results after ranking; omit for uncapped (caller paginates). */
    limit?: number;
    /** When true, empty query returns no hits instead of every non-ideaset idea. */
    requireQuery?: boolean;
    /** When true mid-run, scoring aborts and returns no hits (superseded request). */
    isCancelled?: () => boolean;
}

export const fuzzySearchAnalyser: Analyser<FuzzySearchParams, FuzzySearchHit[]> = {
    id: 'fuzzy_search',
    async run({ store }, { query, limit, requireQuery = false, isCancelled }) {
        const trimmed = query.trim();
        if (requireQuery && !trimmed) {
            return [];
        }
        if (isCancelled?.()) {
            return [];
        }
        const ideas = await store.listAllIdeas();
        // listAllIdeas is sync under sql.js — yield so openIdea / newer searches can run.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (isCancelled?.()) {
            return [];
        }
        const hits = await filterAndScoreIdeasAsync(ideas, trimmed, { isCancelled });
        if (hits === undefined || isCancelled?.()) {
            return [];
        }
        return limit === undefined ? hits : hits.slice(0, Math.max(0, limit));
    }
};

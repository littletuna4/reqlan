/**
 * Analyser entry for fuzzy idea + file search (JS fallback).
 * Activity-bar search uses native `WorkspaceIndex.fuzzySearch` instead.
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".file_search]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
 */
import type { Analyser } from './analyser-registry.js';
import { searchIndex, type FuzzySearchPage } from './fuzzy-search.js';

export interface FuzzySearchParams {
    query: string;
    /** Cap results after ranking; omit for uncapped (caller paginates). */
    limit?: number;
    /** Skip this many ranked hits (load-more). */
    offset?: number;
    /** When true, empty query returns no hits instead of every non-ideaset idea. */
    requireQuery?: boolean;
    /** When true mid-run, scoring aborts and returns no hits (superseded request). */
    isCancelled?: () => boolean;
}

export const fuzzySearchAnalyser: Analyser<FuzzySearchParams, FuzzySearchPage> = {
    id: 'fuzzy_search',
    async run({ store }, { query, limit, offset = 0, requireQuery = false, isCancelled }) {
        const trimmed = query.trim();
        if (requireQuery && !trimmed) {
            return { hits: [], total: 0, truncated: false };
        }
        if (isCancelled?.()) {
            return { hits: [], total: 0, truncated: false };
        }
        const ideas = await store.listAllIdeas();
        const fileUris = await store.listDocumentUris();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (isCancelled?.()) {
            return { hits: [], total: 0, truncated: false };
        }
        return searchIndex(ideas, fileUris, trimmed, { limit, offset, requireQuery });
    }
};

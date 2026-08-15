/**
 * Analyser entry for file-name search over indexed `.rq` documents.
 * rq:["../../../../reqlan rq/core_analysis/search.rq".file_search]
 */
import type { Analyser } from './analyser-registry.js';
import { filterAndScoreFiles, paginateHits, type FuzzySearchPage } from './fuzzy-search.js';

export interface FileSearchParams {
    query: string;
    limit?: number;
    offset?: number;
    requireQuery?: boolean;
}

export const fileSearchAnalyser: Analyser<FileSearchParams, FuzzySearchPage> = {
    id: 'file_search',
    async run({ store }, { query, limit, offset = 0, requireQuery = true }) {
        const trimmed = query.trim();
        if (requireQuery && !trimmed) {
            return { hits: [], total: 0, truncated: false };
        }
        const fileUris = await store.listDocumentUris();
        const ranked = filterAndScoreFiles(fileUris, trimmed);
        return paginateHits(ranked, { limit, offset });
    }
};

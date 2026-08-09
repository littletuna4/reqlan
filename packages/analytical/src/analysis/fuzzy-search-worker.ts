/**
 * Worker-thread fuzzy idea search — keeps scoring off the extension-host event loop.
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
 */
import { parentPort } from 'node:worker_threads';
import { filterAndScoreIdeas, type FuzzySearchHit } from './fuzzy-search.js';
import type { IdeaSummary } from '../core/types.js';

export type FuzzySearchWorkerIdea = Pick<
    IdeaSummary,
    'id' | 'name' | 'kind' | 'fileUri' | 'summary' | 'lineStart' | 'tags'
>;

export type FuzzySearchWorkerInbound =
    | { type: 'setCatalog'; ideas: FuzzySearchWorkerIdea[] }
    | { type: 'clearCatalog' }
    | { type: 'search'; requestId: number; query: string; limit?: number; requireQuery?: boolean }
    | { type: 'cancel'; requestId?: number };

export type FuzzySearchWorkerOutbound =
    | {
          type: 'result';
          requestId: number;
          hits: FuzzySearchHit[];
          total: number;
          truncated: boolean;
      }
    | { type: 'error'; requestId: number; message: string }
    | { type: 'cancelled'; requestId: number };

let catalog: FuzzySearchWorkerIdea[] = [];
let activeRequestId: number | undefined;

if (!parentPort) {
    throw new Error('fuzzy-search-worker must run as a worker thread');
}

parentPort.on('message', (message: FuzzySearchWorkerInbound) => {
    if (!message || typeof message !== 'object' || !('type' in message)) {
        return;
    }
    switch (message.type) {
        case 'setCatalog':
            catalog = message.ideas;
            break;
        case 'clearCatalog':
            catalog = [];
            break;
        case 'cancel':
            if (message.requestId === undefined || message.requestId === activeRequestId) {
                activeRequestId = undefined;
            }
            break;
        case 'search': {
            const { requestId, query, limit, requireQuery = false } = message;
            activeRequestId = requestId;
            try {
                const trimmed = query.trim();
                if (requireQuery && !trimmed) {
                    parentPort!.postMessage({
                        type: 'result',
                        requestId,
                        hits: [],
                        total: 0,
                        truncated: false
                    } satisfies FuzzySearchWorkerOutbound);
                    break;
                }
                const ranked = filterAndScoreIdeas(catalog as IdeaSummary[], trimmed);
                if (activeRequestId !== requestId) {
                    parentPort!.postMessage({
                        type: 'cancelled',
                        requestId
                    } satisfies FuzzySearchWorkerOutbound);
                    break;
                }
                const total = ranked.length;
                const truncated = limit !== undefined && total > limit;
                const hits = limit === undefined ? ranked : ranked.slice(0, Math.max(0, limit));
                parentPort!.postMessage({
                    type: 'result',
                    requestId,
                    hits,
                    total,
                    truncated
                } satisfies FuzzySearchWorkerOutbound);
            } catch (error) {
                parentPort!.postMessage({
                    type: 'error',
                    requestId,
                    message: error instanceof Error ? error.message : String(error)
                } satisfies FuzzySearchWorkerOutbound);
            } finally {
                if (activeRequestId === requestId) {
                    activeRequestId = undefined;
                }
            }
            break;
        }
        default:
            break;
    }
});

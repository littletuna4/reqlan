/**
 * Host-side client for the fuzzy-search worker thread.
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { IdeaSummary } from '../core/types.js';
import type { FuzzySearchHit } from './fuzzy-search.js';
import type {
    FuzzySearchWorkerIdea,
    FuzzySearchWorkerInbound,
    FuzzySearchWorkerOutbound
} from './fuzzy-search-worker.js';

declare const __dirname: string | undefined;

function moduleDirectory(): string {
    if (typeof __dirname === 'string') {
        return __dirname;
    }
    return dirname(fileURLToPath(import.meta.url));
}

/** Resolve the bundled worker script next to the extension host output. */
export function resolveFuzzySearchWorkerPath(explicit?: string): string {
    if (explicit) {
        return explicit;
    }
    const dir = moduleDirectory();
    const candidates = [
        join(dir, 'fuzzy-search-worker.cjs'),
        join(dir, 'fuzzy-search-worker.js'),
        join(dir, '..', 'fuzzy-search-worker.cjs'),
        join(dir, 'extension', 'fuzzy-search-worker.cjs')
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0]!;
}

export interface FuzzySearchWorkerSearchResult {
    hits: FuzzySearchHit[];
    total: number;
    truncated: boolean;
}

type Pending = {
    resolve: (value: FuzzySearchWorkerSearchResult) => void;
    reject: (error: Error) => void;
};

/**
 * Owns a single worker that holds the idea catalog and scores queries off-thread.
 */
export class FuzzySearchWorkerClient {
    private worker: Worker | undefined;
    private readonly pending = new Map<number, Pending>();
    private catalogEpoch = 0;
    private disposed = false;
    private readonly workerPath: string;

    constructor(options?: { workerPath?: string }) {
        this.workerPath = resolveFuzzySearchWorkerPath(options?.workerPath);
    }

    get hasCatalog(): boolean {
        return this.catalogEpoch > 0;
    }

    async setCatalog(ideas: readonly IdeaSummary[]): Promise<number> {
        this.ensureWorker();
        const epoch = ++this.catalogEpoch;
        const compact: FuzzySearchWorkerIdea[] = ideas.map(idea => ({
            id: idea.id,
            name: idea.name,
            kind: idea.kind,
            fileUri: idea.fileUri,
            summary: idea.summary,
            lineStart: idea.lineStart,
            tags: idea.tags
        }));
        this.post({ type: 'setCatalog', ideas: compact });
        return epoch;
    }

    clearCatalog(): void {
        this.catalogEpoch = 0;
        if (this.worker) {
            this.post({ type: 'clearCatalog' });
        }
    }

    search(
        query: string,
        requestId: number,
        options?: { limit?: number; requireQuery?: boolean }
    ): Promise<FuzzySearchWorkerSearchResult> {
        this.ensureWorker();
        return new Promise((resolve, reject) => {
            this.pending.set(requestId, { resolve, reject });
            this.post({
                type: 'search',
                requestId,
                query,
                limit: options?.limit,
                requireQuery: options?.requireQuery
            });
        });
    }

    /** Drop in-flight search promises so callers can move on (worker may still finish). */
    cancelSearches(requestId?: number): void {
        if (this.worker) {
            this.post({ type: 'cancel', requestId });
        }
        if (requestId === undefined) {
            for (const [id, pending] of this.pending) {
                pending.reject(new SearchCancelledError(id));
            }
            this.pending.clear();
            return;
        }
        const pending = this.pending.get(requestId);
        if (pending) {
            this.pending.delete(requestId);
            pending.reject(new SearchCancelledError(requestId));
        }
    }

    dispose(): void {
        this.disposed = true;
        for (const [id, pending] of this.pending) {
            pending.reject(new SearchCancelledError(id));
        }
        this.pending.clear();
        const worker = this.worker;
        this.worker = undefined;
        void worker?.terminate();
    }

    private ensureWorker(): Worker {
        if (this.disposed) {
            throw new Error('FuzzySearchWorkerClient is disposed');
        }
        if (this.worker) {
            return this.worker;
        }
        const worker = new Worker(this.workerPath);
        worker.on('message', (message: FuzzySearchWorkerOutbound) => {
            this.onMessage(message);
        });
        worker.on('error', error => {
            for (const [, pending] of this.pending) {
                pending.reject(error instanceof Error ? error : new Error(String(error)));
            }
            this.pending.clear();
            this.worker = undefined;
        });
        worker.on('exit', code => {
            if (this.disposed) {
                return;
            }
            this.worker = undefined;
            if (code !== 0 && this.pending.size > 0) {
                const error = new Error(`fuzzy-search worker exited with code ${code}`);
                for (const [, pending] of this.pending) {
                    pending.reject(error);
                }
                this.pending.clear();
            }
        });
        this.worker = worker;
        return worker;
    }

    private post(message: FuzzySearchWorkerInbound): void {
        this.ensureWorker().postMessage(message);
    }

    private onMessage(message: FuzzySearchWorkerOutbound): void {
        if (!message || typeof message !== 'object' || !('type' in message)) {
            return;
        }
        const pending = this.pending.get(message.requestId);
        if (!pending) {
            return;
        }
        this.pending.delete(message.requestId);
        if (message.type === 'result') {
            pending.resolve({
                hits: message.hits,
                total: message.total,
                truncated: message.truncated
            });
            return;
        }
        if (message.type === 'cancelled') {
            pending.reject(new SearchCancelledError(message.requestId));
            return;
        }
        pending.reject(new Error(message.message));
    }
}

export class SearchCancelledError extends Error {
    readonly requestId: number;

    constructor(requestId: number) {
        super(`Search ${requestId} cancelled`);
        this.name = 'SearchCancelledError';
        this.requestId = requestId;
    }
}

/**
 * Per-file index outcome shape shared by the soft-sync loop and the facade.
 * The native engine (`NativeWorkspaceIndex.indexFile` / `syncWorkspace`) owns
 * parse → extract → persist; this only carries the timing/outcome summary.
 *
 * rq:["../../../../reqlan rq/indexer/indexer.rq".index]
 * rq:["../../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
 * rq:["../../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_metrics]
 */
import type { IndexFileOutcome } from './index-diagnostics-store.js';

export interface IndexOneFileResult {
    fileUri: string;
    durationMs: number;
    outcome: IndexFileOutcome;
    pathDepth: number;
}

/**
 * Headless ideas index — re-exports the shared {@link WorkspaceIndex}.
 * Prefer importing `WorkspaceIndex` for new code.
 */
export {
    WorkspaceIndex,
    WorkspaceIndex as HeadlessIndexService
} from './index-store/workspace-index.js';
export type { IndexStatusSnapshot, IndexSyncProgress } from './index-store/index-status.js';

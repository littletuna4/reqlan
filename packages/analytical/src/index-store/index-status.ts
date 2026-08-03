import type { DocumentUpdate, IndexState, WorkspaceFileChange } from '../core/analytical-store.js';
import type { FileIndexIssueView, IndexErrorDetail } from '../core/index-error.js';

export interface IndexSyncProgress {
    processed: number;
    total: number;
    /** Workspace-relative path of the file currently being indexed, when known. */
    currentFile?: string;
}

export interface IndexStatusSnapshot {
    state: IndexState;
    ready: boolean;
    ideaCount: number;
    edgeCount: number;
    fileIssueCount: number;
    lastError?: IndexErrorDetail;
    fileIssues: FileIndexIssueView[];
    syncProgress?: IndexSyncProgress;
    recentDocumentUpdates: DocumentUpdate[];
    recentWorkspaceChanges: WorkspaceFileChange[];
}

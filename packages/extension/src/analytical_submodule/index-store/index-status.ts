import type { DocumentUpdate, IndexErrorDetail, IndexState, WorkspaceFileChange } from 'reqlan-analytical';
import type { FileIndexIssueView } from 'reqlan-analytical';

export interface IndexSyncProgress {
    processed: number;
    total: number;
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

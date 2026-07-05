import type { FileIndexIssueView, IdeaTableRow, IdeasetTableRow, IndexErrorDetail, ReferenceTableRow } from 'reqlan-analytical';
import type { IndexStatusSnapshot } from '../analytical_submodule/index-store/index-status.js';

export const IDEAS_PAGE_SIZE = 50;
export const IDEASETS_PAGE_SIZE = 50;
export const REFERENCES_PAGE_SIZE = 50;

export type WebviewToExtensionMessage =
    | { type: 'ready' }
    | { type: 'loadIndexStatus' }
    | { type: 'refreshIndex' }
    | { type: 'loadIdeas'; page: number }
    | { type: 'loadIdeasets'; page: number }
    | { type: 'loadReferences'; page: number }
    | { type: 'openIdea'; fileUri: string; line: number; column?: number }
    | { type: 'dumpFullGraph' };

export type ExtensionToWebviewMessage =
    | { type: 'indexStatus'; status: IndexStatusView }
    | { type: 'ideasPage'; page: number; pageSize: number; total: number; rows: IdeaTableRow[] }
    | { type: 'ideasetsPage'; page: number; pageSize: number; total: number; rows: IdeasetTableRow[] }
    | { type: 'referencesPage'; page: number; pageSize: number; total: number; rows: ReferenceTableRow[] }
    | { type: 'fullGraph'; ideaCount: number; edgeCount: number; ideasJson: string; edgesJson: string }
    | { type: 'error'; message: string };

export interface IndexStatusView {
    state: IndexStatusSnapshot['state'];
    ready: boolean;
    ideaCount: number;
    edgeCount: number;
    fileIssueCount: number;
    lastError?: IndexErrorDetail;
    fileIssues: FileIndexIssueView[];
    syncProgress?: IndexStatusSnapshot['syncProgress'];
    recentActivity: Array<{ label: string; detail: string; at: number }>;
}

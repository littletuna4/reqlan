/**
 * Wire protocol shared by the extension host and Svelte webviews.
 * per ["../../../../../reqlan rq/extension/module/webview.rq"]
 */

export const IDEAS_PAGE_SIZE = 50;
export const IDEASETS_PAGE_SIZE = 50;
export const REFERENCES_PAGE_SIZE = 50;

export interface IndexErrorDetail {
    summary: string;
    file?: string;
    ideas?: string[];
    phase?: string;
    cause?: string;
}

export interface FileIndexIssueView {
    fileUri: string;
    location: string;
    line: number;
    column: number;
    phase: string;
    ideaNames: string[];
    message: string;
    cause?: string;
}

export interface IdeaTableRow {
    id: string;
    title: string;
    path: string;
    mainAttribute?: string;
    otherAttributes: string;
    referenceCount: number;
    fileUri: string;
    lineStart: number;
}

export interface IdeasetMemberRow {
    name: string;
    fileUri: string;
    lineStart: number;
}

export interface IdeasetTableRow {
    id: string;
    name: string;
    path: string;
    kind: 'file' | 'explicit';
    memberCount: number;
    members: IdeasetMemberRow[];
    fileUri: string;
    lineStart: number;
}

export interface ReferenceTableRow {
    sourcePath: string;
    sourceName: string;
    targetPath: string;
    targetName: string;
    isInRq: boolean;
    referenceType: string;
    sourceFileUri: string;
    sourceLineStart: number;
}

export type IndexState =
    | 'uninitialized'
    | 'idle'
    | 'opening'
    | 'syncing'
    | 'ready'
    | 'error';

export interface IndexStatusView {
    state: IndexState;
    ready: boolean;
    ideaCount: number;
    edgeCount: number;
    fileIssueCount: number;
    lastError?: IndexErrorDetail;
    fileIssues: FileIndexIssueView[];
    syncProgress?: { processed: number; total: number };
    recentActivity: Array<{ label: string; detail: string; at: number }>;
}

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

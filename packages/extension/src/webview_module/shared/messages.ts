/**
 * Wire protocol shared by the extension host and Svelte webviews.
 * per ["../../../../../reqlan rq/extension/module/webview.rq"]
 */

export const IDEAS_PAGE_SIZE = 50;
export const IDEASETS_PAGE_SIZE = 50;
export const REFERENCES_PAGE_SIZE = 50;

export type SortDirection = 'asc' | 'desc';

export type IdeasSortColumn = 'title' | 'path' | 'body' | 'outRefs' | 'inRefs' | `attr:${string}`;

export interface ReferenceFilter {
    direction: 'inbound' | 'outbound';
    filterKey: string;
    label: string;
}

export interface IdeasTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: IdeasSortColumn;
    sortDir?: SortDirection;
    attributeColumns: string[];
    referenceFilters: ReferenceFilter[];
}

export type IdeasetsSortColumn = 'name' | 'path' | 'kind' | 'members';

export interface IdeasetsTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: IdeasetsSortColumn;
    sortDir?: SortDirection;
}

export type ReferencesSortColumn = 'source' | 'target' | 'inRq' | 'type';

export interface ReferencesTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: ReferencesSortColumn;
    sortDir?: SortDirection;
}

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
    ideaNames?: string[];
    message: string;
    cause?: string;
}

export interface IdeaReferenceChip {
    label: string;
    fileUri: string;
    line: number;
    direction: 'inbound' | 'outbound';
    filterKey: string;
}

export interface IdeaTableRow {
    id: string;
    title: string;
    path: string;
    mainAttribute?: string;
    otherAttributes: string;
    otherAttributeItems: string[];
    attributeValues: Record<string, string>;
    referenceCount: number;
    outboundCount: number;
    inboundCount: number;
    outboundReferences: IdeaReferenceChip[];
    inboundReferences: IdeaReferenceChip[];
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
    | 'error'
    | 'closing';

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

export interface GraphViewQuery {
    centerId?: string;
    search?: string;
    pathFilter?: string;
    statusFilter?: string;
    tagFilter?: string;
    includeIndirect: boolean;
    maxNodes?: number;
}

export interface GraphNodeView {
    id: string;
    name: string;
    kind: string;
    fileUri: string;
    path: string;
    lineStart: number;
    status?: string;
    tags: string[];
    isExternal?: boolean;
}

export interface GraphEdgeView {
    id: string;
    sourceId: string;
    targetId: string;
    kind: string;
    label?: string;
}

export interface GraphViewSlice {
    query: GraphViewQuery;
    centerId?: string;
    depth: number;
    truncated: boolean;
    totalMatching?: number;
    waitingForIndex?: boolean;
    nodes: GraphNodeView[];
    edges: GraphEdgeView[];
}

/** Progress phases while the extension builds a graph slice. */
export type GraphLoadPhase =
    | 'queued'
    | 'checking-index'
    | 'waiting-for-index'
    | 'resolving-focus'
    | 'querying-slice'
    | 'packaging-slice'
    | 'failed';

export interface GraphLoadProgress {
    requestId?: number;
    phase: GraphLoadPhase;
    detail?: string;
}

export interface IdeasSummaryNavigateIntent {
    activeTab?: 'index' | 'ideas' | 'ideasets' | 'references' | 'graph';
    centerId?: string;
    pathFilter?: string;
    includeIndirect?: boolean;
}

export type WebviewToExtensionMessage =
    | { type: 'ready' }
    | { type: 'loadIndexStatus' }
    | { type: 'refreshIndex' }
    | { type: 'clearAndRebuildIndex' }
    | { type: 'loadIdeas'; query: IdeasTableQuery }
    | { type: 'loadIdeasets'; query: IdeasetsTableQuery }
    | { type: 'loadReferences'; query: ReferencesTableQuery }
    | { type: 'loadGraph'; query: GraphViewQuery; requestId?: number }
    | { type: 'requestWebviewReload' }
    | { type: 'openIdea'; fileUri: string; line: number; column?: number }
    | { type: 'dumpFullGraph' };

export type ExtensionToWebviewMessage =
    | { type: 'indexStatus'; status: IndexStatusView }
    | { type: 'ideasPage'; query: IdeasTableQuery; total: number; rows: IdeaTableRow[] }
    | { type: 'ideasetsPage'; query: IdeasetsTableQuery; total: number; rows: IdeasetTableRow[] }
    | { type: 'referencesPage'; query: ReferencesTableQuery; total: number; rows: ReferenceTableRow[] }
    | { type: 'graphLoadProgress'; progress: GraphLoadProgress }
    | { type: 'graphSlice'; slice: GraphViewSlice; requestId?: number }
    | { type: 'navigate'; intent: IdeasSummaryNavigateIntent }
    | { type: 'fullGraph'; ideaCount: number; edgeCount: number; ideasJson: string; edgesJson: string }
    | { type: 'error'; message: string; requestId?: number };

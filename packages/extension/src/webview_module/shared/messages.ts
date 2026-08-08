/**
 * Wire protocol shared by the extension host and Svelte webviews.
 * per ["../../../../../reqlan rq/extension/module/webview.rq"]
 * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".ontology_aligned_tabs]
 */

import type { GraphUiPersistedState } from './graph-ui-state.js';
import type { TableUiPersistedState } from './table-ui-state.js';

export type {
    GraphUiLabelMode,
    GraphUiNodeTypeId,
    GraphUiPersistedState,
    GraphUiPhysicsPersisted,
    GraphUiTruncationBasis
} from './graph-ui-state.js';
export {
    DEFAULT_GRAPH_UI_PHYSICS,
    DEFAULT_GRAPH_UI_STATE,
    GRAPH_UI_LABEL_MODES,
    GRAPH_UI_WORKSPACE_STATE_KEY,
    normalizeGraphUiState
} from './graph-ui-state.js';
export type {
    IdeasGroupBy,
    ReferencesGroupBy,
    TableUiPersistedState
} from './table-ui-state.js';
export {
    DEFAULT_ATTRIBUTES_COLUMNS,
    DEFAULT_BASES_COLUMNS,
    DEFAULT_IDEAS_COLUMNS,
    DEFAULT_IDEASETS_COLUMNS,
    DEFAULT_REFERENCES_COLUMNS,
    DEFAULT_TABLE_UI_STATE,
    TABLE_UI_WORKSPACE_STATE_KEY,
    normalizeTableUiState
} from './table-ui-state.js';

export const IDEAS_PAGE_SIZE = 50;
export const IDEASETS_PAGE_SIZE = 50;
export const REFERENCES_PAGE_SIZE = 50;
export const ATTRIBUTES_PAGE_SIZE = 50;

export type SortDirection = 'asc' | 'desc';

export type IdeasSortColumn = 'title' | 'path' | 'body' | 'kind' | 'outRefs' | 'inRefs' | `attr:${string}`;

export interface ReferenceFilter {
    direction: 'inbound' | 'outbound';
    filterKey: string;
    label: string;
}

export interface ColumnFilter {
    column: string;
    text?: string;
    selected?: string[];
}

export interface IdeasTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: IdeasSortColumn;
    sortDir?: SortDirection;
    attributeColumns: string[];
    referenceFilters: ReferenceFilter[];
    columnFilters?: ColumnFilter[];
    groupBy?: 'kind';
}

export type IdeasetsSortColumn = 'name' | 'path' | 'kind' | 'members';

export interface IdeasetsTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: IdeasetsSortColumn;
    sortDir?: SortDirection;
    columnFilters?: ColumnFilter[];
}

export type ReferencesSortColumn = 'source' | 'target' | 'inRq' | 'type';

export interface ReferencesTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: ReferencesSortColumn;
    sortDir?: SortDirection;
    columnFilters?: ColumnFilter[];
    groupBy?: 'type';
}

export type AttributesSortColumn = 'key' | 'ideaCount' | 'valueCount';

export interface AttributesTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: AttributesSortColumn;
    sortDir?: SortDirection;
    columnFilters?: ColumnFilter[];
}

export interface AttributeTableRow {
    key: string;
    ideaCount: number;
    valueCount: number;
    sampleValues: string[];
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
    kind: 'block' | 'oneliner';
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
    /** Thin context-scope v2 card cue from ref fanout. */
    stabilityCue?: number;
    stabilityLabel?: string;
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
    /** Resolved path used to open the target (file refs and idea targets). */
    targetFileUri?: string;
}

export type IndexState =
    | 'uninitialized'
    | 'idle'
    | 'opening'
    | 'syncing'
    | 'ready'
    | 'error'
    | 'closing';

export interface BaseStatusView {
    id: string;
    label: string;
    root: string;
    ready: boolean;
    ideaCount: number;
    edgeCount: number;
    fileIssueCount: number;
    state: IndexState;
}

export interface IndexStatusView {
    state: IndexState;
    ready: boolean;
    ideaCount: number;
    edgeCount: number;
    fileIssueCount: number;
    lastError?: IndexErrorDetail;
    fileIssues: FileIndexIssueView[];
    syncProgress?: { processed: number; total: number; currentFile?: string };
    recentActivity: Array<{ label: string; detail: string; at: number }>;
    /** Active base id when multi-base. */
    activeBaseId?: string;
    /** True when no `.reqlan` bases were discovered. */
    discoveryEmpty?: boolean;
    /** All discovered bases (workspace pane). */
    bases?: BaseStatusView[];
}

export interface OverviewLink {
    id: string;
    label: string;
    href: string;
}

export interface OverviewSearchHit {
    kind: 'idea' | 'ideaset' | 'attribute' | 'reference';
    title: string;
    detail: string;
    fileUri?: string;
    lineStart?: number;
    /** Attribute key when kind === 'attribute'. */
    attributeKey?: string;
}

export interface OverviewSearchSection {
    surface: 'ideas' | 'ideasets' | 'attributes' | 'references';
    label: string;
    total: number;
    hits: OverviewSearchHit[];
}

export interface OverviewSearchResult {
    query: string;
    sections: OverviewSearchSection[];
}

/** Coverage metrics for Overview — computed lazily on expand. */
export interface OverviewCoverageScores {
    ideaCount: number;
    rqFileCount: number;
    eligibleNonRqFileCount: number;
    referencedEligibleFileCount: number;
    /** 0–100; null when there are no eligible non-.rq files. */
    fileCoveragePct: number | null;
    distinctFileReferenceCount: number;
    totalLoc: number;
    /** Ideas per 1000 LOC; null when LOC is 0. */
    ideasPerKLoc: number | null;
    /** True when LOC counting hit size caps (totals are lower bounds). */
    locTruncated: boolean;
    calculatedAt: number;
}

export type TimelineEventSource = 'git' | 'index';

export interface TimelineEventView {
    id: string;
    source: TimelineEventSource;
    at: number;
    /** Short action label: Created / Modified / Reindexed */
    label: string;
    /** Primary display — idea name */
    detail: string;
    ideaId?: string;
    ideaName?: string;
    summary?: string;
    status?: string;
    ideaKind?: string;
    tags?: string[];
    path?: string;
    fileUri?: string;
    lineStart?: number;
}

export interface GraphViewQuery {
    centerId?: string;
    search?: string;
    pathFilter?: string;
    /** Multi-select status keys; may include FILTER_NOT_PRESENT for missing @status. */
    statusFilter?: string[];
    /** Multi-select tag keys; may include FILTER_NOT_PRESENT for missing @tags. */
    tagFilter?: string[];
    /** @deprecated Prefer hopDepth */
    includeIndirect: boolean;
    hopDepth?: number;
    maxNodes?: number;
    /** When the matching set exceeds maxNodes, which ordering decides who stays. */
    truncationBasis?: 'path' | 'git-modified' | 'git-created';
}

export interface GraphNodeView {
    id: string;
    name: string;
    kind: string;
    fileUri: string;
    path: string;
    lineStart: number;
    status?: string;
    /** FILTER_NOT_PRESENT | FILTER_EMPTY | concrete @status value. */
    statusKey?: string;
    tags: string[];
    /** [FILTER_NOT_PRESENT] | [FILTER_EMPTY] | concrete tags. */
    tagsKeys?: string[];
    isExternal?: boolean;
    /** Context-scope v2 hotspot overlay band for churn/risk. */
    hotspotBand?: 'low' | 'medium' | 'high';
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
    activeTab?: 'overview' | 'bases' | 'index' | 'ideas' | 'ideasets' | 'attributes' | 'references' | 'graph' | 'timeline';
    centerId?: string;
    pathFilter?: string;
    includeIndirect?: boolean;
    referenceFilters?: ReferenceFilter[];
    /** Scope Ideas Summary to this base id. */
    baseId?: string;
}

export type WebviewToExtensionMessage =
    | { type: 'ready' }
    | { type: 'loadIndexStatus' }
    | { type: 'refreshIndex' }
    | { type: 'cancelIndexSync' }
    | { type: 'clearAndRebuildIndex' }
    | { type: 'selectBase'; baseId: string }
    | { type: 'createBase' }
    | { type: 'loadIdeas'; query: IdeasTableQuery }
    | { type: 'loadIdeasets'; query: IdeasetsTableQuery }
    | { type: 'loadReferences'; query: ReferencesTableQuery }
    | { type: 'loadAttributes'; query: AttributesTableQuery }
    | { type: 'loadTimeline' }
    | { type: 'loadOverviewCoverage' }
    | { type: 'overviewSearch'; query: string }
    | { type: 'loadGraph'; query: GraphViewQuery; requestId?: number }
    | { type: 'requestWebviewReload' }
    | { type: 'openIdea'; fileUri: string; line: number; column?: number }
    | { type: 'openExternal'; href: string }
    | { type: 'openExport'; format?: 'html' | 'pdf' | 'markdown' | 'json' | 'csv' }
    | { type: 'dumpFullGraph' }
    | { type: 'persistGraphUiState'; state: GraphUiPersistedState }
    | { type: 'persistTableUiState'; state: TableUiPersistedState };

export type ExtensionToWebviewMessage =
    | { type: 'indexStatus'; status: IndexStatusView }
    | { type: 'ideasPage'; query: IdeasTableQuery; total: number; rows: IdeaTableRow[] }
    | { type: 'ideasetsPage'; query: IdeasetsTableQuery; total: number; rows: IdeasetTableRow[] }
    | { type: 'referencesPage'; query: ReferencesTableQuery; total: number; rows: ReferenceTableRow[] }
    | { type: 'attributesPage'; query: AttributesTableQuery; total: number; rows: AttributeTableRow[] }
    | { type: 'timelinePage'; events: TimelineEventView[] }
    | { type: 'overviewSearchResult'; result: OverviewSearchResult }
    | { type: 'overviewCoverage'; scores?: OverviewCoverageScores; error?: string }
    | { type: 'overviewLinks'; links: OverviewLink[] }
    | { type: 'graphLoadProgress'; progress: GraphLoadProgress }
    | { type: 'graphSlice'; slice: GraphViewSlice; requestId?: number }
    | { type: 'navigate'; intent: IdeasSummaryNavigateIntent }
    | { type: 'fullGraph'; ideaCount: number; edgeCount: number; ideasJson: string; edgesJson: string }
    | { type: 'graphUiState'; state: GraphUiPersistedState }
    | { type: 'tableUiState'; state: TableUiPersistedState }
    | { type: 'error'; message: string; requestId?: number };

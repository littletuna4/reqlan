export type {
    DocumentUpdate,
    DocumentUpdateIdea,
    IndexError,
    IndexEvent,
    FileIndexIssue,
    IndexState,
    WorkspaceChange,
    WorkspaceFileChange
} from './core/index-state-types.js';
export type { IndexErrorPhase } from './core/index-state-types.js';
export { toIndexErrorDetail, toFileIndexIssueView, errorCauseMessage } from './core/index-error.js';
export type { IndexErrorDetail, FileIndexIssueView } from './core/index-error.js';
export {
    normalizeIndexedDocument,
    resolveWorkspaceFileUri,
    toWorkspaceRelativePath
} from './core/workspace-paths.js';
export {
    fileUriFromFsPath,
    fsPathFromFileUri,
    isWindowsAbsolutePath
} from './core/path-relative.js';
export {
    APPLICATION_MEMORY_DIR,
    CLICK_SESSIONS_FILENAME,
    CONFIG_FILENAME,
    GITIGNORE_FILENAME,
    IDEAS_INDEX_FILENAME,
    INDEX_DIAGNOSTICS_FILENAME,
    RQIGNORE_FILENAME,
    resolveApplicationMemoryPath,
    resolveClickSessionsDbPath,
    resolveIdeasIndexDbPath,
    resolveIndexDiagnosticsDbPath
} from './core/application-memory.js';
export {
    BINARY_RQIGNORE_PATTERNS,
    DEFAULT_RQIGNORE_PATTERNS,
    createRqIgnoreFilter,
    defaultRqIgnoreFileContents,
    isIgnoredPath,
    loadRqIgnore,
    resolveRqIgnorePath
} from './core/rqignore.js';
export type { RqIgnoreFilter } from './core/rqignore.js';
export { createBase } from './core/create-base.js';
export type { CreateBaseResult } from './core/create-base.js';
export { barrelPage, planBarrelPage, rewriteSiblingRefs } from './core/barrel-page.js';
export type {
    BarrelPageChildPlan,
    BarrelPageOptions,
    BarrelPagePlan,
    BarrelPagePlanOptions,
    BarrelPageResult
} from './core/barrel-page.js';

export {
    baseForPath,
    childBasesOf,
    discoverBases,
    discoverBasesUnder,
    filesOwnedByBase,
    isPathInsideOrEqual,
    nearestBaseRoot,
    selectDefaultBase,
    stableBaseId,
    toBaseDescriptor
} from './core/base-discovery.js';
export type { BaseDescriptor } from './core/base-discovery.js';
export { BaseRegistry } from './index-store/base-registry.js';
export type { BaseStatusEntry, RegisteredBase } from './index-store/base-registry.js';
export { resolveReferencedFilePath } from './core/file-reference-resolve.js';
export { SqliteIndexStore, type InboundForFileRow } from './index-store/sqlite-store.js';
export type {
    IdeasTableQuery,
    IdeasetsTableQuery,
    ReferencesTableQuery,
    AttributesTableQuery,
    AttributeTableRow,
    GitIdeaTimelineEvent,
    ColumnFilter,
    ReferenceFilter,
    IdeasSortColumn,
    IdeasetsSortColumn,
    ReferencesSortColumn,
    AttributesSortColumn,
    IdeasGroupBy,
    ReferencesGroupBy,
    SortDirection
} from './index-store/webview-table-queries.js';
export {
    attributeKeyFromChipItem,
    attributeJsonPath,
    formatAttributeValue,
    aggregateAttributesFromRows,
    filterAndPageAttributes,
    edgeKindsForReferenceViewTypes
} from './index-store/webview-table-queries.js';
export type {
    GraphViewQuery,
    GraphViewSlice,
    GraphNodeView,
    GraphEdgeView,
    GraphTruncationBasis
} from './index-store/webview-graph-queries.js';
export type { OverviewCoverageScores } from './native/native-workspace-index.js';
export {
    GRAPH_MAX_NODES,
    GRAPH_NODES_HARD_CAP,
    GRAPH_TRUNCATION_BASIS_OPTIONS,
    buildGraphFilterWhereClause,
    buildGraphTruncationOrderClause,
    buildGraphViewSlice,
    buildGraphSliceForIdeaIds,
    toGraphNodeView,
    isWildcardReferenceEdge,
    CONTEXT_MIN_HOP_DEPTH,
    CONTEXT_MAX_HOP_DEPTH,
    clampGraphHopDepth
} from './index-store/webview-graph-queries.js';
export {
    ACTIVITY_BAR_MAX_NODES,
    BLOCKING_STATUSES
} from './core/types.js';
export { resolveBidirectionalIdeaReferences } from './core/idea-references.js';
export type { IdeaReferenceStore } from './core/idea-references.js';
export {
    dedupeIdeaSummaries,
    localSymbolicIdeaById,
    localSymbolicIdeaSummary,
    localSymbolicNeighborIdeas,
    localSymbolicReferenceRowsForIdea,
    localSymbolicReferencesForIdea,
    mergeReferenceRows
} from './core/local-symbolic-references.js';
export type { LocalSymbolicIdeaReferences } from './core/local-symbolic-references.js';
export { analyzeLocalSymbolic, extractIdeaNames, parseAlignSnapshot, parseReqlanSource } from './native/parse-source.js';
export type {
    LocalSymbolicDocument,
    LocalSymbolicEdge,
    LocalSymbolicIdea,
    LocalSymbolicImportRoot
} from './native/parse-source.js';
export * from './core/types.js';
export {
    FILTER_EMPTY,
    FILTER_EMPTY_LABEL,
    FILTER_NOT_PRESENT,
    FILTER_NOT_PRESENT_LABEL,
    FILTER_UNSPECIFIED,
    attributePresence,
    filterDisplayLabel,
    isFilterEmpty,
    isFilterNotPresent,
    isFilterUnspecified,
    isSpecialFilterValue,
    statusFilterKey,
    statusFilterKeyFromAttributes,
    statusIsNotPresent,
    tagsAreNotPresent,
    tagsFilterKeysFromAttributes
} from './core/filter-specials.js';
export type { AttributePresence } from './core/filter-specials.js';
export { WorkspaceIndex, WorkspaceIndex as HeadlessIndexService } from './index-store/workspace-index.js';
export type { FuzzySearchResult, IdleCheckResult } from './index-store/workspace-index.js';
export type { FuzzySearchHit } from './index-store/fuzzy-search-hit.js';
export type { IndexStatusSnapshot, IndexSyncProgress } from './index-store/index-status.js';
export {
    IndexDiagnosticsStore,
    pathDepthFromUri
} from './index-store/index-diagnostics-store.js';
export type {
    IndexDiagnosticsOverview,
    IndexFileOutcome,
    IndexFileTimingRecord,
    IndexFileTimingRow,
    IndexSyncRunRecord,
    IndexSyncRunSummary,
    IndexTimingTrigger
} from './index-store/index-diagnostics-store.js';
export {
    fileIssue,
    fileIssueFromError,
    unnamedIdeaIssues,
    validIdeas
} from './index-store/index-parse-issues.js';
export type { FileIndexIssueDraft } from './index-store/index-parse-issues.js';
export {
    IndexFileError,
    recordCaughtFileIssue,
    recordCaughtIndexError,
    toFileIndexIssueDraft
} from './index-store/index-file-error.js';
export { NativeAnalysisApi } from './native/native-analysis-api.js';
export type {
    AnalysisRuntimeOptions,
    CheckOptions,
    ClickOptions,
    ClickResult,
    NameAmbiguity,
    InteractionDescriptor,
    RequirementMatch,
    SearchRequirementsOptions,
    SparseWildcardHandling
} from './native/native-analysis-api.js';
export {
    openAnalysisApi,
    type HeadlessAnalysisApi,
    type OpenedAnalysisApi
} from './native/open-analysis-api.js';
export { findRqIgnoreErrorTargetLines } from './native/ignore-error.js';
export {
    nativeEngineRequested,
    loadNativeEngine,
    tryLoadNativeEngine,
    nativeEngineAvailable,
    addNativeEngineSearchDirs,
    hostNativeBindingSpec,
    stagedNativeHostMismatch,
    resetNativeEngineCache
} from './native/load-native.js';
export type { HostNativeBindingSpec } from './native/load-native.js';
export { NativeWorkspaceIndex } from './native/native-workspace-index.js';
export type { NativeSyncResult } from './native/native-workspace-index.js';
export { NativeIndexStore } from './native/native-index-store.js';
export { NativeSqlConnection } from './native/native-sql-db.js';
export { buildExportSnapshot } from './export/build-export-snapshot.js';
export { exportMarkdown } from './export/export-markdown.js';
export { exportJson } from './export/export-json.js';
export { exportCsv } from './export/export-csv.js';
export { csvEscape } from './export/write-csv-export.js';
export { isSecretRqPath } from './export/secret-rq.js';
export type {
    ExportCounts,
    ExportClusterStrategy,
    ExportFormat,
    ExportHeaderLink,
    ExportProgress,
    ExportProgressCallback,
    ExportProgressPhase,
    ExportRequest,
    ExportResult,
    ExportRuntimeMode,
    ExportScope,
    ExportSnapshot
} from './export/types.js';

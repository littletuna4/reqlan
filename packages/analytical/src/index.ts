export { createAnalyticalStore } from './core/analytical-store.js';
export type {
    AnalyticalState,
    AnalyticalStore,
    AnalyticalStoreState,
    AnalysisRun,
    DocumentUpdate,
    IndexError,
    FileIndexIssue,
    IndexState,
    WorkspaceChange,
    WorkspaceFileChange
} from './core/analytical-store.js';
export type { IndexErrorPhase } from './core/analytical-store.js';
export { toIndexErrorDetail, toFileIndexIssueView, errorCauseMessage } from './core/index-error.js';
export type { IndexErrorDetail, FileIndexIssueView } from './core/index-error.js';
export {
    normalizeIndexedDocument,
    resolveWorkspaceFileUri,
    toWorkspaceRelativePath
} from './core/workspace-paths.js';
export type { Analyser, AnalyserContext } from './analysis/analyser-registry.js';
export { AnalyserRegistry } from './analysis/analyser-registry.js';
export { listAllIdeasAnalyser } from './analysis/list-ideas-analyser.js';
export { fileRelatedAnalyser } from './analysis/file-related-analyser.js';
export { deprecationImpactAnalyser } from './analysis/deprecation-impact-analyser.js';
export { gitDatesAnalyser } from './analysis/git-dates-analyser.js';
export { completionTrackingAnalyser } from './analysis/completion-tracking-analyser.js';
export { localGraphAnalyser } from './analysis/local-graph-analyser.js';
export { semanticSearchAnalyser } from './analysis/semantic-search-analyser.js';
export { extractIndexedDocument } from './index-store/idea-extractor.js';
export { SqliteIndexStore } from './index-store/sqlite-store.js';
export type {
    IdeasTableQuery,
    IdeasetsTableQuery,
    ReferencesTableQuery,
    ReferenceFilter,
    IdeasSortColumn,
    IdeasetsSortColumn,
    ReferencesSortColumn,
    SortDirection
} from './index-store/webview-table-queries.js';
export {
    attributeKeyFromChipItem,
    attributeJsonPath,
    formatAttributeValue
} from './index-store/webview-table-queries.js';
export type {
    GraphViewQuery,
    GraphViewSlice,
    GraphNodeView,
    GraphEdgeView
} from './index-store/webview-graph-queries.js';
export {
    GRAPH_MAX_NODES,
    buildGraphFilterWhereClause,
    buildGraphViewSlice,
    toGraphNodeView
} from './index-store/webview-graph-queries.js';
export {
    ACTIVITY_BAR_MAX_NODES,
    BLOCKING_STATUSES
} from './core/types.js';
export type {
    ActivityBarScope,
    AncestorChainResult,
    CurrentFileSlice,
    IdeaWithRange,
    OutlineNode,
    ReferenceListRow,
    ReqlanContextModel,
    ContextAnomaly,
    ContextDimensionContribution,
    ContextDimensionId,
    ContextFileEntry,
    ContextFocus,
    ContextFootprint,
    GitContextSlice,
    WorkspaceContextSlice
} from './core/types.js';
export type {
    ContextFileLensDetail,
    ContextReferencesSlice,
    ContextSelection
} from './core/context-model.js';
export {
    CONTEXT_DIMENSION_LABELS,
    CONTEXT_DIMENSION_WEIGHTS,
    DEFAULT_ENABLED_DIMENSIONS
} from './core/context-model.js';
export { resolveBidirectionalIdeaReferences } from './core/idea-references.js';
export type { IdeaReferenceStore } from './core/idea-references.js';
export * from './core/types.js';
export { HeadlessIndexService } from './headless-index-service.js';
export {
    activateAnalysisRuntime,
    createAnalysisRuntime,
    deactivateAnalysisRuntime
} from './create-runtime.js';
export type { AnalysisRuntime, AnalysisRuntimeOptions } from './create-runtime.js';
export { AnalysisApi } from './analysis-api.js';
export type { InteractionDescriptor, RequirementMatch } from './analysis-api.js';

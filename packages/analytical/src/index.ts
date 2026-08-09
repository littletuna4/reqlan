export { createAnalyticalStore } from './core/analytical-store.js';
export type {
    AnalyticalState,
    AnalyticalStore,
    AnalyticalStoreState,
    AnalysisRun,
    DocumentUpdate,
    DocumentUpdateIdea,
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
export {
    APPLICATION_MEMORY_DIR,
    CONFIG_FILENAME,
    IDEAS_INDEX_FILENAME,
    INDEX_DIAGNOSTICS_FILENAME,
    RQIGNORE_FILENAME,
    resolveApplicationMemoryPath,
    resolveIdeasIndexDbPath,
    resolveIndexDiagnosticsDbPath
} from './core/application-memory.js';
export {
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
    selectDefaultBase,
    stableBaseId,
    toBaseDescriptor
} from './core/base-discovery.js';
export type { BaseDescriptor } from './core/base-discovery.js';
export { BaseRegistry } from './index-store/base-registry.js';
export type { BaseStatusEntry, RegisteredBase } from './index-store/base-registry.js';
export { resolveReferencedFilePath } from './core/file-reference-resolve.js';
export type { Analyser, AnalyserContext } from './analysis/analyser-registry.js';
export { AnalyserRegistry } from './analysis/analyser-registry.js';
export { listAllIdeasAnalyser } from './analysis/list-ideas-analyser.js';
export { fileRelatedAnalyser } from './analysis/file-related-analyser.js';
export { deprecationImpactAnalyser } from './analysis/deprecation-impact-analyser.js';
export { gitDatesAnalyser } from './analysis/git-dates-analyser.js';
export type { GitDateInfo } from './analysis/git-dates-analyser.js';
export { completionTrackingAnalyser } from './analysis/completion-tracking-analyser.js';
export { localGraphAnalyser } from './analysis/local-graph-analyser.js';
export { semanticSearchAnalyser } from './analysis/semantic-search-analyser.js';
export { fuzzySearchAnalyser } from './analysis/fuzzy-search-analyser.js';
export type { FuzzySearchParams } from './analysis/fuzzy-search-analyser.js';
export {
    filterAndScoreIdeas,
    filterAndScoreIdeasAsync,
    fuzzySubsequence,
    matchQueryTokens,
    normalizeSearchSeparators,
    splitSearchTokens
} from './analysis/fuzzy-search.js';
export type { FuzzySearchHit } from './analysis/fuzzy-search.js';
export {
    FuzzySearchWorkerClient,
    SearchCancelledError,
    resolveFuzzySearchWorkerPath
} from './analysis/fuzzy-search-worker-client.js';
export type {
    FuzzySearchWorkerIdea,
    FuzzySearchWorkerInbound,
    FuzzySearchWorkerOutbound
} from './analysis/fuzzy-search-worker.js';
export type { FuzzySearchWorkerSearchResult } from './analysis/fuzzy-search-worker-client.js';
export { extractIndexedDocument } from './index-store/idea-extractor.js';
export { SqliteIndexStore } from './index-store/sqlite-store.js';
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
export {
    computeOverviewCoverageScores
} from './index-store/overview-coverage.js';
export type {
    OverviewCoverageScores,
    ComputeOverviewCoverageOptions
} from './index-store/overview-coverage.js';
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
    GitAuthorRollup,
    GitContextSlice,
    GitFocusStats,
    GitFocusCommit,
    GitPeerChangeRate,
    WorkspaceBaseGlance,
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
    CONTEXT_GRAPH_SEARCH_DIMENSIONS,
    DEFAULT_ENABLED_DIMENSIONS
} from './core/context-model.js';
export {
    buildAiReadiness,
    buildContextFingerprint,
    buildFocusSignals,
    CONTEXT_FINGERPRINT_AXIS_HELP,
    CONTEXT_FINGERPRINT_HELP,
    emptyContextSignals,
    emptyContextSynthesis,
    fingerprintAxisTooltip,
    formatAiReadinessMarkdown,
    formatFingerprintMarkdown,
    formatSynthesisMarkdown,
    hopDistancesFromCenter,
    hotspotBandFromRisk,
    hotspotBorderColor,
    hotspotBorderWidth,
    impactOpacityForHopDistance,
    requirementCardCue,
    synthesizeFocusContext,
    thinChurnIntensity,
    timelineMilestones
} from './core/context-signals.js';
export type {
    AiReadiness,
    ContextCoverageLevel,
    ContextFingerprintAxes,
    ContextHotspotBand,
    ContextRiskLevel,
    ContextSignals,
    ContextSynthesis,
    DevelopmentHistorySignals,
    FocusSignalInput,
    LifecycleSignals,
    QualitySignals,
    RelationshipSignals,
    RiskSignals
} from './core/context-signals.js';
export { resolveBidirectionalIdeaReferences } from './core/idea-references.js';
export type { IdeaReferenceStore } from './core/idea-references.js';
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
export type { IdleCheckResult } from './index-store/workspace-index.js';
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
    collectParseIssues,
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
export {
    activateAnalysisRuntime,
    createAnalysisRuntime,
    deactivateAnalysisRuntime
} from './create-runtime.js';
export type { AnalysisRuntime, AnalysisRuntimeOptions } from './create-runtime.js';
export { AnalysisApi } from './analysis-api.js';
export type { InteractionDescriptor, RequirementMatch } from './analysis-api.js';
export { buildExportSnapshot } from './export/build-export-snapshot.js';
export { exportHtml } from './export/export-html.js';
export { exportMarkdown } from './export/export-markdown.js';
export { exportJson } from './export/export-json.js';
export { exportCsv } from './export/export-csv.js';
export { csvEscape } from './export/write-csv-export.js';
export { writeHtmlExport } from './export/write-html-export.js';
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
export {
    DEFAULT_PHYSICS_SETTINGS,
    ReqlanGraphPhysics,
    accumulateForces,
    hashAngle,
    integrateFromForces,
    stepPhysics
} from './graph/physics-core.js';
export type {
    PhysicsCoreSettings,
    PhysicsEdge,
    PhysicsStepState
} from './graph/physics-core.js';

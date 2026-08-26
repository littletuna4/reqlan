/**
 * Core analytical engine for CLI and MCP: Rust via napi, no Langium.
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".cutover]
 */
export { createBase } from '../core/create-base.js';
export type { CreateBaseResult } from '../core/create-base.js';
export { barrelPage, planBarrelPage, rewriteSiblingRefs } from '../core/barrel-page.js';
export type {
    BarrelPageChildPlan,
    BarrelPageOptions,
    BarrelPagePlan,
    BarrelPagePlanOptions,
    BarrelPageResult
} from '../core/barrel-page.js';
export { toWorkspaceRelativePath } from '../core/path-relative.js';
export type {
    CompletionSummary,
    FileRelatedRequirements,
    GraphSlice,
    IdeaSummary
} from '../core/types.js';
export type { BrokenReferenceDto } from './generated.js';
export type {
    ExportClusterStrategy,
    ExportRuntimeMode,
    ExportScope
} from '../export/types.js';
export { NativeAnalysisApi } from './native-analysis-api.js';
export type {
    AnalysisRuntimeOptions,
    ClickOptions,
    ClickResult,
    InteractionDescriptor,
    RequirementMatch,
    SearchRequirementsOptions
} from './native-analysis-api.js';
export {
    openAnalysisApi,
    type HeadlessAnalysisApi,
    type OpenedAnalysisApi
} from './open-analysis-api.js';
export { extractIdeaNames, analyzeLocalSymbolic, parseAlignSnapshot, parseReqlanSource } from './parse-source.js';
export type {
    LocalSymbolicDocument,
    LocalSymbolicEdge,
    LocalSymbolicIdea,
    LocalSymbolicImportRoot,
    NativeAlignRef,
    NativeAlignSnapshot,
    NativeParseDiagnostic,
    NativeParseElement,
    NativeParseResult
} from './parse-source.js';
/** rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore] */
export { findRqIgnoreErrorTargetLines } from './ignore-error.js';
export {
    addNativeEngineSearchDirs,
    hostNativeBindingSpec
} from './load-native.js';
export type { HostNativeBindingSpec } from './load-native.js';

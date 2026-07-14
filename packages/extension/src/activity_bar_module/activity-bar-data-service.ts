export { ActivityBarDataService, ContextModelBuilder } from './context-model.js';
export type { ContextBuildInput } from './context-model.js';
export {
    buildOutlineFromIdeas,
    filterReferences,
    formatIdeaMarkdown,
    groupReferences
} from './context-helpers.js';
export {
    bumpContextRevision,
    clearManualIdeas,
    createContextSession,
    pinManualIdea,
    recordFileEdit,
    recordFileVisit,
    setDimensionEnabled,
    setExpandedLens,
    unpinManualIdea,
    adjustGlobalHopDepth,
    adjustDimensionHopDepth,
    effectiveHopDepth,
    dimensionSupportsHopControl,
    CONTEXT_MIN_HOP_DEPTH,
    CONTEXT_MAX_HOP_DEPTH
} from './context-session.js';
export type { ContextSessionState } from './context-session.js';

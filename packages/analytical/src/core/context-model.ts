/**
 * Composed reqlan context model — dimensions, focus, and merged footprint.
 * per ["../../../../reqlan rq/extension/module/context-scope.rq"]
 */
import type { IdeaSummary, IdeaWithRange, OutlineNode, ReferenceListRow } from './types.js';
import type {
    AiReadiness,
    ContextFingerprintAxes,
    ContextSignals,
    ContextSynthesis
} from './context-signals.js';

export type {
    AiReadiness,
    ContextFingerprintAxes,
    ContextSignals,
    ContextSynthesis,
    ContextRiskLevel,
    ContextCoverageLevel,
    ContextHotspotBand,
    DevelopmentHistorySignals,
    LifecycleSignals,
    QualitySignals,
    RelationshipSignals,
    RiskSignals
} from './context-signals.js';

export interface ContextReferencesSlice {
    ideaId: string;
    rows: ReferenceListRow[];
}

export type ContextDimensionId =
    | 'workspace'
    | 'current_file'
    | 'open_files'
    | 'file_history'
    | 'edit_history'
    | 'manual'
    | 'git';

export type ContextFocusKind = 'idea' | 'file' | 'selection' | 'none';

export interface ContextFocus {
    kind: ContextFocusKind;
    ideaId?: string;
    fileUri?: string;
    line?: number;
    selectionIdeaIds?: string[];
}

export interface ContextFileEntry {
    fileUri: string;
    fileLabel: string;
    line?: number;
    touchedAt?: number;
    gitChange?: 'staged' | 'unstaged' | 'both';
    sources: ContextDimensionId[];
}

export interface ContextIdeaEntry {
    idea: IdeaSummary;
    sources: ContextDimensionId[];
    weight: number;
}

export interface ContextProvenance {
    ideaSources: Record<string, ContextDimensionId[]>;
    fileSources: Record<string, ContextDimensionId[]>;
}

export interface ContextDimensionContribution {
    id: ContextDimensionId;
    label: string;
    enabled: boolean;
    pinned: boolean;
    weight: number;
    ideaCount: number;
    fileCount: number;
    summary: string;
    /** Effective graph hop depth for this dimension (inherits global when unset). */
    hopDepth: number;
    /** True when this dimension supports per-lens hop overrides. */
    supportsHopControl: boolean;
}

export interface CurrentFileSlice {
    fileUri: string;
    fileLabel: string;
    isRqFile: boolean;
    focusIdea?: IdeaSummary;
    ideasInFile: IdeaWithRange[];
    outline: OutlineNode[];
    unresolvedCount: number;
    /** Ideas with edges to this file (or its ideas) — file-scoped inbound. */
    referencingIdeas: IdeaSummary[];
    /** Ideas that reference the focused idea — idea-scoped inbound. */
    inboundReferencingIdeas: IdeaSummary[];
    /** Ideas the focused idea references — idea-scoped outbound. */
    referencedIdeas: IdeaSummary[];
    commentLinkedIdeas: IdeaSummary[];
    folderReferencingIdeas: IdeaSummary[];
    gitChange?: 'staged' | 'unstaged' | 'both';
}

export interface ContextSelection {
    fileUri: string;
    startLine: number;
    endLine: number;
    ideaIds: string[];
    ideas: IdeaSummary[];
}

export interface ContextFileLensDetail {
    fileUri: string;
    fileLabel: string;
    ideasInFile: IdeaWithRange[];
    relatedIdeas: IdeaSummary[];
}

/** @deprecated Use CurrentFileSlice — kept for wire compat during migration */
export type ActivityBarScope = CurrentFileSlice;

export interface GitContextSlice {
    branch?: string;
    unstagedCount: number;
    stagedCount: number;
    changedFiles: ContextFileEntry[];
}

export interface WorkspaceContextSlice {
    ready: boolean;
    ideaCount: number;
    edgeCount: number;
}

export interface ContextFootprint {
    ideaIds: string[];
    fileUris: string[];
    effectiveCenterId?: string;
    summaryLine: string;
    provenance: ContextProvenance;
}

export interface ContextAnomaly {
    kind: 'unresolved_refs' | 'index_issue' | 'git_conflict';
    message: string;
    action?: 'filter_broken_refs' | 'open_workspace' | 'open_file';
    fileUri?: string;
}

export interface ReqlanContextModel {
    revision: number;
    focus: ContextFocus;
    dimensions: ContextDimensionContribution[];
    footprint: ContextFootprint;
    expandedLens?: ContextDimensionId;
    /** Global graph hop depth for panes and context search. */
    globalHopDepth: number;
    minHopDepth: number;
    maxHopDepth: number;
    /** Per-dimension hop overrides; omitted dimensions inherit globalHopDepth. */
    dimensionHopDepth: Partial<Record<ContextDimensionId, number>>;
    currentFile?: CurrentFileSlice;
    openFiles: ContextFileEntry[];
    fileHistory: ContextFileEntry[];
    editHistory: ContextFileEntry[];
    manualIdeas: IdeaSummary[];
    git?: GitContextSlice;
    workspace: WorkspaceContextSlice;
    anomalies: ContextAnomaly[];
    selection?: ContextSelection;
    /** Bidirectional reference rows for [footprint.effectiveCenterId]. */
    references?: ContextReferencesSlice;
    /** v2 focus signals (relationship, history, risk, …). */
    signals?: ContextSignals;
    /** v2 synthesized knowledge for the focus entity. */
    synthesis?: ContextSynthesis;
    /** Compact axes describing what is in composed context. */
    fingerprint?: ContextFingerprintAxes;
    /** Whether AI has enough / safe enough context to assist. */
    aiReadiness?: AiReadiness;
}

export const CONTEXT_DIMENSION_LABELS: Record<ContextDimensionId, string> = {
    workspace: 'Workspace',
    current_file: 'This file',
    open_files: 'Open',
    file_history: 'Visited',
    edit_history: 'Edited',
    manual: 'Pinned',
    git: 'Git'
};

export const CONTEXT_DIMENSION_WEIGHTS: Record<ContextDimensionId, number> = {
    workspace: 0.1,
    current_file: 1.0,
    open_files: 0.6,
    file_history: 0.4,
    edit_history: 0.5,
    manual: 0.9,
    git: 0.7
};

export const DEFAULT_ENABLED_DIMENSIONS: Record<ContextDimensionId, boolean> = {
    workspace: true,
    current_file: true,
    open_files: true,
    file_history: true,
    edit_history: true,
    manual: true,
    git: true
};

/** Dimensions that traverse the requirement graph and expose hop controls. */
export const CONTEXT_GRAPH_SEARCH_DIMENSIONS: ContextDimensionId[] = [
    'current_file',
    'open_files',
    'file_history',
    'edit_history',
    'manual'
];

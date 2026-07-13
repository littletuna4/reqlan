/**
 * Composed reqlan context model — dimensions, focus, and merged footprint.
 * per ["../../../../reqlan rq/extension/module/context-scope.rq"]
 */
import type { IdeaSummary, IdeaWithRange, OutlineNode, ReferenceListRow } from './types.js';

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

/**
 * Session-side context signals (history rings, dimension toggles, hop depth).
 * per ["../../../../reqlan rq/extension/module/context-scope.rq"]
 */
import {
    clampGraphHopDepth,
    CONTEXT_GRAPH_SEARCH_DIMENSIONS,
    CONTEXT_MAX_HOP_DEPTH,
    CONTEXT_MIN_HOP_DEPTH,
    type ContextDimensionId,
    type IdeaSummary
} from 'reqlan-analytical';

const MAX_HISTORY = 12;

export interface ContextSessionState {
    revision: number;
    dimensionEnabled: Record<ContextDimensionId, boolean>;
    expandedLens?: ContextDimensionId;
    globalHopDepth: number;
    dimensionHopDepth: Partial<Record<ContextDimensionId, number>>;
    fileHistory: string[];
    editHistory: Array<{ fileUri: string; line: number; at: number }>;
    manualIdeas: IdeaSummary[];
}

export function createContextSession(): ContextSessionState {
    return {
        revision: 0,
        dimensionEnabled: {
            workspace: true,
            current_file: true,
            open_files: true,
            file_history: true,
            edit_history: true,
            manual: true,
            git: true
        },
        globalHopDepth: CONTEXT_MIN_HOP_DEPTH,
        dimensionHopDepth: {},
        fileHistory: [],
        editHistory: [],
        manualIdeas: []
    };
}

export function bumpContextRevision(session: ContextSessionState): void {
    session.revision += 1;
}

export function effectiveHopDepth(
    session: ContextSessionState,
    dimension?: ContextDimensionId
): number {
    if (dimension && session.dimensionHopDepth[dimension] !== undefined) {
        return clampGraphHopDepth(session.dimensionHopDepth[dimension]!);
    }
    return clampGraphHopDepth(session.globalHopDepth);
}

export function adjustGlobalHopDepth(session: ContextSessionState, delta: number): number {
    session.globalHopDepth = clampGraphHopDepth(session.globalHopDepth + delta);
    bumpContextRevision(session);
    return session.globalHopDepth;
}

export function adjustDimensionHopDepth(
    session: ContextSessionState,
    dimension: ContextDimensionId,
    delta: number
): number {
    const current = effectiveHopDepth(session, dimension);
    session.dimensionHopDepth[dimension] = clampGraphHopDepth(current + delta);
    bumpContextRevision(session);
    return session.dimensionHopDepth[dimension]!;
}

export function dimensionSupportsHopControl(id: ContextDimensionId): boolean {
    return CONTEXT_GRAPH_SEARCH_DIMENSIONS.includes(id);
}

export function recordFileVisit(session: ContextSessionState, fileUri: string): void {
    session.fileHistory = [fileUri, ...session.fileHistory.filter(uri => uri !== fileUri)].slice(0, MAX_HISTORY);
    bumpContextRevision(session);
}

export function recordFileEdit(session: ContextSessionState, fileUri: string, line: number): void {
    const at = Date.now();
    session.editHistory = [
        { fileUri, line, at },
        ...session.editHistory.filter(entry => entry.fileUri !== fileUri || entry.line !== line)
    ].slice(0, MAX_HISTORY);
    bumpContextRevision(session);
}

export function setDimensionEnabled(
    session: ContextSessionState,
    id: ContextDimensionId,
    enabled: boolean
): void {
    session.dimensionEnabled[id] = enabled;
    bumpContextRevision(session);
}

export function setExpandedLens(session: ContextSessionState, id: ContextDimensionId | undefined): void {
    session.expandedLens = id;
    bumpContextRevision(session);
}

export function pinManualIdea(session: ContextSessionState, idea: IdeaSummary): void {
    if (session.manualIdeas.some(entry => entry.id === idea.id)) {
        return;
    }
    session.manualIdeas.push(idea);
    bumpContextRevision(session);
}

export function unpinManualIdea(session: ContextSessionState, ideaId: string): void {
    session.manualIdeas = session.manualIdeas.filter(idea => idea.id !== ideaId);
    bumpContextRevision(session);
}

export function clearManualIdeas(session: ContextSessionState): void {
    session.manualIdeas = [];
    bumpContextRevision(session);
}

export { CONTEXT_MIN_HOP_DEPTH, CONTEXT_MAX_HOP_DEPTH };

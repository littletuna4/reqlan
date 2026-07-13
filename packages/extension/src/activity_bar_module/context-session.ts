/**
 * Session-side context signals (history rings, dimension toggles).
 * per ["../../../../reqlan rq/extension/module/context-scope.rq"]
 */
import type { ContextDimensionId, IdeaSummary } from 'reqlan-analytical';

const MAX_HISTORY = 12;

export interface ContextSessionState {
    revision: number;
    dimensionEnabled: Record<ContextDimensionId, boolean>;
    expandedLens?: ContextDimensionId;
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
        fileHistory: [],
        editHistory: [],
        manualIdeas: []
    };
}

export function bumpContextRevision(session: ContextSessionState): void {
    session.revision += 1;
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

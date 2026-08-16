/**
 * File-index issue helpers (Langium document parse helpers removed after native cutover).
 */
import type { FileIndexIssue, IndexErrorPhase } from '../core/index-state-types.js';
import type { IdeaRecord } from '../core/types.js';
import { errorCauseMessage } from '../core/index-error.js';

export type FileIndexIssueDraft = Omit<FileIndexIssue, 'fileUri' | 'at'>;

export function fileIssue(
    message: string,
    phase: IndexErrorPhase,
    line = 0,
    column = 0,
    ideaNames?: string[]
): FileIndexIssueDraft {
    return { line, column, message, phase, ideaNames };
}

export function fileIssueFromError(
    phase: IndexErrorPhase,
    error: unknown,
    fallbackMessage: string,
    line = 0,
    column = 0,
    ideaNames?: string[]
): FileIndexIssueDraft {
    const cause = errorCauseMessage(error);
    return {
        line,
        column,
        message: fallbackMessage,
        phase,
        ideaNames,
        cause
    };
}

export function unnamedIdeaIssues(ideas: IdeaRecord[]): FileIndexIssueDraft[] {
    return ideas
        .filter(idea => !idea.name?.trim())
        .map(idea => fileIssue('Idea without a name cannot be indexed', 'persist', idea.lineStart, 0));
}

export function validIdeas(ideas: IdeaRecord[]): IdeaRecord[] {
    return ideas.filter(idea => idea.name?.trim());
}

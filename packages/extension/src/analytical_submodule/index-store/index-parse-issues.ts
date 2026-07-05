import type { LangiumDocument } from 'langium';
import type { FileIndexIssue, IdeaRecord, IndexErrorPhase } from 'reqlan-analytical';
import { errorCauseMessage } from 'reqlan-analytical';

export type FileIndexIssueDraft = Omit<FileIndexIssue, 'fileUri' | 'at'>;

export function collectParseIssues(document: LangiumDocument): FileIndexIssueDraft[] {
    const issues: FileIndexIssueDraft[] = [];
    for (const error of document.parseResult.parserErrors) {
        const position = parserErrorPosition(error);
        issues.push({
            line: position.line,
            column: position.column,
            message: error.message,
            phase: 'parse'
        });
    }
    for (const error of document.parseResult.lexerErrors) {
        issues.push({
            line: Math.max(0, (error.line ?? 1) - 1),
            column: Math.max(0, (error.column ?? 1) - 1),
            message: error.message,
            phase: 'parse'
        });
    }
    return issues;
}

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

function parserErrorPosition(error: { token?: { startLine?: number; startColumn?: number; endLine?: number; endColumn?: number; startOffset?: number }; previousToken?: { endLine?: number; endColumn?: number; startOffset?: number } }): { line: number; column: number } {
    const token = error.token;
    if (token && !Number.isNaN(token.startOffset) && token.startLine !== undefined) {
        return {
            line: Math.max(0, token.startLine - 1),
            column: Math.max(0, (token.startColumn ?? 1) - 1)
        };
    }
    const previousToken = error.previousToken;
    if (previousToken && !Number.isNaN(previousToken.startOffset) && previousToken.endLine !== undefined) {
        return {
            line: Math.max(0, previousToken.endLine - 1),
            column: Math.max(0, (previousToken.endColumn ?? 1) - 1)
        };
    }
    return { line: 0, column: 0 };
}

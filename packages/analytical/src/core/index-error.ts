import type { IndexError } from './analytical-store.js';

export type { IndexErrorPhase } from './analytical-store.js';

export interface IndexErrorDetail {
    summary: string;
    file?: string;
    ideas?: string[];
    phase?: string;
    cause?: string;
}

export function errorCauseMessage(cause: unknown): string | undefined {
    if (cause instanceof Error) {
        return cause.message;
    }
    if (typeof cause === 'string' && cause) {
        return cause;
    }
    return undefined;
}

export interface FileIndexIssueView {
    file: string;
    fileUri: string;
    line: number;
    column: number;
    message: string;
    phase: string;
    location: string;
    ideaNames?: string[];
    cause?: string;
}

export function toFileIndexIssueView(
    issue: import('./analytical-store.js').FileIndexIssue,
    relativePath: (fileUri: string) => string = uri => uri
): FileIndexIssueView {
    const file = relativePath(issue.fileUri);
    return {
        file,
        fileUri: issue.fileUri,
        line: issue.line,
        column: issue.column,
        message: issue.message,
        phase: issue.phase,
        location: `${file}:${issue.line + 1}:${issue.column + 1}`,
        ideaNames: issue.ideaNames?.length ? issue.ideaNames : undefined,
        cause: issue.cause
    };
}

export function toIndexErrorDetail(
    error: IndexError,
    relativePath: (fileUri: string) => string = uri => uri
): IndexErrorDetail {
    return {
        summary: error.message,
        file: error.fileUri ? relativePath(error.fileUri) : undefined,
        ideas: error.ideaNames?.length ? error.ideaNames : undefined,
        phase: error.phase,
        cause: errorCauseMessage(error.cause)
    };
}

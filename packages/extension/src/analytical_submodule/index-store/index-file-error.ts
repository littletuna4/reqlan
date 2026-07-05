import type { IndexErrorPhase } from 'reqlan-analytical';
import type { FileIndexIssueDraft } from './index-parse-issues.js';
import { fileIssueFromError } from './index-parse-issues.js';

export class IndexFileError extends Error {
    readonly fileUri: string;
    readonly phase: IndexErrorPhase;
    readonly ideaNames?: string[];
    readonly underlyingCause?: unknown;

    constructor(
        message: string,
        fileUri: string,
        phase: IndexErrorPhase,
        ideaNames?: string[],
        cause?: unknown
    ) {
        super(message);
        this.name = 'IndexFileError';
        this.fileUri = fileUri;
        this.phase = phase;
        this.ideaNames = ideaNames;
        this.underlyingCause = cause;
    }
}

export function toFileIndexIssueDraft(error: IndexFileError): FileIndexIssueDraft {
    return fileIssueFromError(
        error.phase,
        error.underlyingCause ?? error,
        error.message,
        0,
        0,
        error.ideaNames
    );
}

export function recordCaughtFileIssue(
    recordFileIndexIssues: (fileUri: string, issues: FileIndexIssueDraft[]) => void,
    fileUri: string,
    error: unknown,
    fallbackMessage: string,
    fallbackPhase: IndexErrorPhase = 'sync'
): void {
    if (error instanceof IndexFileError) {
        recordFileIndexIssues(fileUri, [toFileIndexIssueDraft(error)]);
        return;
    }
    recordFileIndexIssues(fileUri, [
        fileIssueFromError(fallbackPhase, error, fallbackMessage)
    ]);
}

export function recordCaughtIndexError(
    recordIndexError: (
        message: string,
        cause?: unknown,
        context?: { fileUri?: string; ideaNames?: string[]; phase?: IndexErrorPhase }
    ) => void,
    error: unknown,
    fallbackMessage: string,
    fallbackPhase: IndexErrorPhase = 'sync'
): void {
    recordIndexError(fallbackMessage, error, { phase: fallbackPhase });
}

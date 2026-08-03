/**
 * Wire types for the index diagnostics webview.
 *
 * rq:["../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_webview]
 */

export interface DiagnosticsRunView {
    id: number;
    trigger: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    totalFiles: number;
    skippedMtime: number;
    indexedFiles: number;
    errorFiles: number;
    cancelled: boolean;
    sumFileDurationMs: number;
    avgPathDepth: number | undefined;
}

export interface DiagnosticsFileView {
    id: number;
    runId: number;
    fileUri: string;
    durationMs: number;
    outcome: string;
    pathDepth: number;
}

export interface DiagnosticsOverviewView {
    runCount: number;
    latestRun: DiagnosticsRunView | undefined;
    totalDurationMs: number;
    totalFileDurationMs: number;
    averageRunDurationMs: number;
    averagePathDepth: number | undefined;
}

export type IndexDiagnosticsToExtensionMessage =
    | { type: 'ready' }
    | { type: 'refresh' }
    | { type: 'selectRun'; runId: number }
    | { type: 'setFileOrder'; order: 'duration_desc' | 'duration_asc' | 'path' }
    | { type: 'openFile'; fileUri: string };

export type ExtensionToIndexDiagnosticsMessage =
    | {
        type: 'snapshot';
        baseLabel: string;
        baseRoot: string;
        overview: DiagnosticsOverviewView | undefined;
        runs: DiagnosticsRunView[];
        selectedRunId: number | undefined;
        selectedRun: DiagnosticsRunView | undefined;
        files: DiagnosticsFileView[];
        fileOrder: 'duration_desc' | 'duration_asc' | 'path';
    }
    | { type: 'error'; message: string };

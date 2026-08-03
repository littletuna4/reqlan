/**
 * Soft workspace sync and idle staleness check implementations.
 *
 * Soft sync loads document mtimes once (`listDocumentMtimes`) then skips
 * unchanged files in memory — not one SQLite round-trip per file.
 *
 * rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_incrementality]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_auto]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_open]
 * rq:["../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_metrics]
 * rq:["../../../reqlan rq/indexer/indexer.rq".index_diagnostics_timing]
 */
import type { AnalyticalStore } from '../core/analytical-store.js';
import {
    pathDepthFromUri,
    type IndexDiagnosticsStore,
    type IndexFileTimingRecord,
    type IndexTimingTrigger
} from './index-diagnostics-store.js';
import { recordCaughtFileIssue } from './index-file-error.js';
import type { IndexSyncProgress } from './index-status.js';
import type { SqliteIndexStore } from './sqlite-store.js';
import { indexOneFile, type IndexOneFileDeps } from './workspace-index-file.js';
import { diffStaleFiles, isUnchangedByMtime } from './workspace-mtime.js';

export interface IdleCheckResult {
    checked: number;
    indexed: number;
    removed: number;
}

export interface SoftSyncDeps {
    sqlite: SqliteIndexStore;
    analytical: AnalyticalStore;
    toIndexedUri: (filePath: string) => string;
    relativePath: (fileUri: string) => string;
    indexFileDeps: IndexOneFileDeps;
    collectRqFiles: () => Promise<string[]>;
    setRqFilePaths: (paths: string[]) => void;
    isReady: () => boolean;
    getCancelRequested: () => boolean;
    setSyncProgress: (progress: IndexSyncProgress | undefined) => void;
    notifyStatusUpdated: () => void;
    notifyCatalogUpdated: () => void;
    waitForReadyOrError: () => Promise<boolean>;
    diagnostics?: IndexDiagnosticsStore;
    timingTrigger?: IndexTimingTrigger;
}

export async function runSoftSync(deps: SoftSyncDeps, filePaths?: string[]): Promise<boolean> {
    const analytical = deps.analytical.getState();
    if (!analytical.dispatchIndex('sync')) {
        return deps.waitForReadyOrError();
    }
    analytical.clearLastError();
    deps.notifyStatusUpdated();
    const runStartedAt = new Date().toISOString();
    const wallStarted = performance.now();
    const fileTimings: IndexFileTimingRecord[] = [];
    let skippedMtime = 0;
    let indexedFiles = 0;
    let errorFiles = 0;
    let cancelled = false;
    try {
        const files = filePaths ?? await deps.collectRqFiles();
        if (filePaths) {
            deps.setRqFilePaths(filePaths);
        }

        // One SQLite read for the whole pass; skip decisions use the in-memory map.
        const storedMtimes = await deps.sqlite.listDocumentMtimes();

        deps.setSyncProgress({ processed: 0, total: files.length });
        deps.notifyStatusUpdated();

        let processed = 0;
        let currentFile: string | undefined;
        for (const filePath of files) {
            if (deps.getCancelRequested()) {
                cancelled = true;
                break;
            }
            const indexedUri = deps.toIndexedUri(filePath);
            currentFile = deps.relativePath(indexedUri);
            deps.setSyncProgress({ processed, total: files.length, currentFile });
            deps.notifyStatusUpdated();
            try {
                if (await isUnchangedByMtime(filePath, indexedUri, storedMtimes)) {
                    skippedMtime += 1;
                    fileTimings.push({
                        fileUri: indexedUri,
                        durationMs: 0,
                        outcome: 'mtime_skip',
                        pathDepth: pathDepthFromUri(indexedUri)
                    });
                } else {
                    const result = await indexOneFile(deps.indexFileDeps, filePath);
                    indexedFiles += 1;
                    if (result.outcome === 'error') {
                        errorFiles += 1;
                    }
                    fileTimings.push({
                        fileUri: result.fileUri,
                        durationMs: result.durationMs,
                        outcome: result.outcome,
                        pathDepth: result.pathDepth
                    });
                }
            } catch (error) {
                errorFiles += 1;
                recordCaughtFileIssue(
                    analytical.recordFileIndexIssues,
                    indexedUri,
                    error,
                    `Failed to index ${deps.relativePath(indexedUri)}`
                );
                fileTimings.push({
                    fileUri: indexedUri,
                    durationMs: 0,
                    outcome: 'error',
                    pathDepth: pathDepthFromUri(indexedUri)
                });
            }
            processed += 1;
            deps.setSyncProgress({ processed, total: files.length, currentFile });
            deps.notifyStatusUpdated();
        }

        if (!analytical.dispatchIndex('synced')) {
            analytical.recordIndexError(
                'Index sync finished but state transition to ready failed',
                undefined,
                { phase: 'transition' }
            );
        }
        const counts = await deps.sqlite.counts();
        analytical.setIndexReady({ ideaCount: counts.ideas, edgeCount: counts.edges });
        deps.setSyncProgress(undefined);
        deps.notifyCatalogUpdated();
        deps.notifyStatusUpdated();

        await recordDiagnostics(deps, {
            trigger: deps.timingTrigger ?? 'soft_sync',
            startedAt: runStartedAt,
            finishedAt: new Date().toISOString(),
            durationMs: performance.now() - wallStarted,
            totalFiles: files.length,
            skippedMtime,
            indexedFiles,
            errorFiles,
            cancelled,
            sumFileDurationMs: fileTimings.reduce((sum, row) => sum + row.durationMs, 0),
            avgPathDepth: averageDepth(fileTimings),
            files: fileTimings
        });

        return deps.isReady();
    } catch (error) {
        analytical.dispatchIndex('fail');
        analytical.recordIndexError('Workspace sync failed', error, { phase: 'sync' });
        deps.setSyncProgress(undefined);
        deps.notifyStatusUpdated();
        await recordDiagnostics(deps, {
            trigger: deps.timingTrigger ?? 'soft_sync',
            startedAt: runStartedAt,
            finishedAt: new Date().toISOString(),
            durationMs: performance.now() - wallStarted,
            totalFiles: fileTimings.length,
            skippedMtime,
            indexedFiles,
            errorFiles: errorFiles + 1,
            cancelled,
            sumFileDurationMs: fileTimings.reduce((sum, row) => sum + row.durationMs, 0),
            avgPathDepth: averageDepth(fileTimings),
            files: fileTimings
        });
        return false;
    }
}

export interface StaleCheckDeps {
    sqlite: SqliteIndexStore;
    toIndexedUri: (filePath: string) => string;
    removeDocuments: (indexedUris: string[]) => Promise<void>;
    syncWorkspace: (filePaths: string[]) => Promise<boolean>;
    syncInFlight: boolean;
}

/**
 * Cheap idle pass: one mtime map from SQLite, FS stats for candidates, index only dirty paths.
 * No sync state / progress when nothing is stale.
 */
export async function checkStaleFiles(
    deps: StaleCheckDeps,
    filePaths: string[]
): Promise<IdleCheckResult> {
    if (deps.syncInFlight) {
        return { checked: 0, indexed: 0, removed: 0 };
    }

    const storedMtimes = await deps.sqlite.listDocumentMtimes();
    const { dirtyPaths, removedUris } = await diffStaleFiles(
        filePaths,
        deps.toIndexedUri,
        storedMtimes
    );

    if (removedUris.length > 0) {
        await deps.removeDocuments(removedUris);
    }

    if (dirtyPaths.length === 0) {
        return { checked: filePaths.length, indexed: 0, removed: removedUris.length };
    }

    const ok = await deps.syncWorkspace(dirtyPaths);
    return {
        checked: filePaths.length,
        indexed: ok ? dirtyPaths.length : 0,
        removed: removedUris.length
    };
}

function averageDepth(files: IndexFileTimingRecord[]): number | undefined {
    if (files.length === 0) {
        return undefined;
    }
    const sum = files.reduce((acc, row) => acc + row.pathDepth, 0);
    return sum / files.length;
}

async function recordDiagnostics(
    deps: SoftSyncDeps,
    run: Parameters<IndexDiagnosticsStore['recordSyncRun']>[0]
): Promise<void> {
    if (!deps.diagnostics) {
        return;
    }
    try {
        await deps.diagnostics.recordSyncRun(run);
    } catch {
        // Diagnostics must never fail the sync.
    }
}

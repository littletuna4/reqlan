/**
 * rq:["../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_metrics]
 * rq:["../../reqlan rq/extension/module/index.rq".index_diagnostics_store]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import {
    IndexDiagnosticsStore,
    pathDepthFromUri
} from '../src/index-store/index-diagnostics-store.js';
import { WorkspaceIndex } from '../src/index-store/workspace-index.js';

describe('index diagnostics', () => {
    test('pathDepthFromUri counts segments', () => {
        expect(pathDepthFromUri('a.rq')).toBe(1);
        expect(pathDepthFromUri('folder/nested/a.rq')).toBe(3);
        expect(pathDepthFromUri('./folder/a.rq')).toBe(2);
    });

    test('records sync runs and ranks files by duration', async () => {
        const root = join(tmpdir(), `reqlan-diag-${randomUUID()}`);
        await mkdir(join(root, '.reqlan'), { recursive: true });
        const store = await IndexDiagnosticsStore.open(join(root, '.reqlan', 'index-diagnostics.sqlite'));

        await store.recordSyncRun({
            trigger: 'soft_sync',
            startedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:00:01.000Z',
            durationMs: 1000,
            totalFiles: 2,
            skippedMtime: 0,
            indexedFiles: 2,
            errorFiles: 0,
            cancelled: false,
            sumFileDurationMs: 150,
            avgPathDepth: 1.5,
            files: [
                { fileUri: 'slow.rq', durationMs: 120, outcome: 'persisted', pathDepth: 1 },
                { fileUri: 'fast.rq', durationMs: 30, outcome: 'persisted', pathDepth: 2 }
            ]
        });

        const overview = await store.getOverview();
        expect(overview.runCount).toBe(1);
        expect(overview.totalDurationMs).toBe(1000);
        expect(overview.latestRun?.totalFiles).toBe(2);

        const files = await store.listFileTimings(overview.latestRun!.id, { order: 'duration_desc' });
        expect(files.map(f => f.fileUri)).toEqual(['slow.rq', 'fast.rq']);
        await store.close();
    });

    test('WorkspaceIndex records timings on activate sync', async () => {
        const root = join(tmpdir(), `reqlan-diag-idx-${randomUUID()}`);
        await mkdir(root, { recursive: true });
        await writeFile(join(root, 'a.rq'), 'alpha this is alpha\n', 'utf8');
        await writeFile(join(root, 'b.rq'), 'beta this is beta\n', 'utf8');
        await mkdir(join(root, 'nested'), { recursive: true });
        await writeFile(join(root, 'nested', 'c.rq'), 'gamma this is gamma\n', 'utf8');

        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        const overview = await index.getIndexDiagnosticsOverview();
        expect(overview?.runCount).toBeGreaterThanOrEqual(1);
        expect(overview?.latestRun?.totalFiles).toBe(3);
        expect(overview?.latestRun?.durationMs).toBeGreaterThan(0);
        expect(overview?.latestRun?.avgPathDepth).toBeCloseTo((1 + 1 + 2) / 3, 5);

        const runs = await index.listIndexDiagnosticRuns();
        const files = await index.listIndexDiagnosticFileTimings(runs[0]!.id, { order: 'duration_desc' });
        expect(files).toHaveLength(3);
        await index.deactivate();
    });
});

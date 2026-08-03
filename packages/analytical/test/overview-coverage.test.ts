/**
 * rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, test } from 'vitest';
import { ideaId, type EdgeRecord, type IdeaRecord } from '../src/core/types.js';
import { computeOverviewCoverageScores } from '../src/index-store/overview-coverage.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';

const temps: string[] = [];

afterEach(() => {
    for (const dir of temps.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'reqlan-coverage-'));
    temps.push(dir);
    return dir;
}

function idea(name: string, fileUri: string): IdeaRecord {
    return {
        id: ideaId(fileUri, name),
        name,
        kind: 'block',
        fileUri,
        lineStart: 0,
        lineEnd: 2,
        summary: name,
        attributesJson: '{}',
        contentHash: 'h'
    };
}

function fileEdge(sourceId: string, targetFile: string): EdgeRecord {
    return {
        id: `${sourceId}->${targetFile}`,
        sourceId,
        targetFile,
        kind: 'file_reference',
        isResolved: true
    };
}

describe('overview coverage scores', () => {
    test('reports file coverage pct and ideas/kLOC for eligible non-rq files', async () => {
        const root = tempDir();
        mkdirSync(join(root, 'src'), { recursive: true });
        mkdirSync(join(root, 'reqs'), { recursive: true });
        writeFileSync(join(root, 'src', 'a.ts'), 'line1\nline2\nline3\n');
        writeFileSync(join(root, 'src', 'b.ts'), 'only\n');
        writeFileSync(join(root, 'src', 'c.ts'), 'x\n');
        writeFileSync(join(root, 'reqs', 'spec.rq'), 'idea {\n  body\n}\n');

        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-cov-${randomUUID()}.sqlite`));
        const rqUri = 'reqs/spec.rq';
        const source = idea('feature', rqUri);
        await store.upsertDocument(rqUri, 'hash', [source], [
            fileEdge(source.id, '../src/a.ts'),
            fileEdge(source.id, '../src/b.ts')
        ]);

        const scores = await computeOverviewCoverageScores({ baseRoot: root, store });
        expect(scores.ideaCount).toBe(1);
        expect(scores.rqFileCount).toBe(1);
        expect(scores.eligibleNonRqFileCount).toBe(3);
        expect(scores.referencedEligibleFileCount).toBe(2);
        expect(scores.fileCoveragePct).toBeCloseTo(66.7, 0);
        expect(scores.distinctFileReferenceCount).toBe(2);
        expect(scores.totalLoc).toBeGreaterThanOrEqual(5);
        expect(scores.ideasPerKLoc).not.toBeNull();
        await store.close();
    });

    test('folder file references cover nested eligible files', async () => {
        const root = tempDir();
        mkdirSync(join(root, 'lib', 'nested'), { recursive: true });
        mkdirSync(join(root, 'reqs'), { recursive: true });
        writeFileSync(join(root, 'lib', 'one.ts'), 'a\n');
        writeFileSync(join(root, 'lib', 'nested', 'two.ts'), 'b\n');
        writeFileSync(join(root, 'reqs', 'spec.rq'), 'idea {\n}\n');

        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-cov-${randomUUID()}.sqlite`));
        const rqUri = 'reqs/spec.rq';
        const source = idea('pack', rqUri);
        await store.upsertDocument(rqUri, 'hash', [source], [
            fileEdge(source.id, '../lib')
        ]);

        const scores = await computeOverviewCoverageScores({ baseRoot: root, store });
        expect(scores.eligibleNonRqFileCount).toBe(2);
        expect(scores.referencedEligibleFileCount).toBe(2);
        expect(scores.fileCoveragePct).toBe(100);
        await store.close();
    });
});

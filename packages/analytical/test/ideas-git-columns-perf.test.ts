/**
 * Performance guards for Ideas table git columns (indexed read, never git-on-load).
 * rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
 * rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_columns_performance]
 * rq:["../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
 */
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ideaId, type IdeaRecord, type EdgeRecord } from '../src/core/types.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import type { IdeasTableQuery } from '../src/index-store/webview-table-queries.js';

const IDEA_COUNT = 2_000;
const PAGE_SIZE = 50;
const FILES = 40;

function mockIdea(
    name: string,
    fileUri: string,
    lineStart: number,
    overrides: Partial<IdeaRecord> = {}
): IdeaRecord {
    return {
        id: ideaId(fileUri, name),
        name,
        kind: lineStart % 5 === 0 ? 'oneliner' : 'block',
        fileUri,
        lineStart,
        lineEnd: lineStart + 3,
        summary: `${name} summary`,
        attributesJson: JSON.stringify({ status: 'done', tags: ['perf'] }),
        contentHash: 'hash',
        ...overrides
    };
}

async function seedLargeIdeasIndex(): Promise<SqliteIndexStore> {
    const store = await SqliteIndexStore.open(
        join(tmpdir(), `reqlan-ideas-git-perf-${randomUUID()}.sqlite`)
    );
    const perFile = Math.ceil(IDEA_COUNT / FILES);
    let created = 0;
    for (let fileIndex = 0; fileIndex < FILES; fileIndex++) {
        const fileUri = `file:///workspace/perf/doc-${fileIndex}.rq`;
        const ideas: IdeaRecord[] = [];
        const edges: EdgeRecord[] = [];
        for (let local = 0; local < perFile && created < IDEA_COUNT; local++) {
            const name = `idea_${created}`;
            const lineStart = local * 5;
            const idea = mockIdea(name, fileUri, lineStart, {
                gitCreatedAt: `2024-01-${String((created % 28) + 1).padStart(2, '0')}T00:00:00Z`,
                gitModifiedAt: `2025-06-${String((created % 28) + 1).padStart(2, '0')}T12:00:00Z`,
                gitChangeCount: (created % 40) + 1
            });
            ideas.push(idea);
            if (local > 0) {
                const previous = ideas[local - 1]!;
                edges.push({
                    id: `edge-${previous.id}-${idea.id}`,
                    sourceId: previous.id,
                    targetId: idea.id,
                    kind: 'references',
                    label: previous.name
                });
            }
            created += 1;
        }
        await store.upsertDocument(fileUri, `hash-${fileIndex}`, ideas, edges);
    }
    return store;
}

function median(samples: number[]): number {
    const sorted = [...samples].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)]!;
}

const baseQuery: IdeasTableQuery = {
    page: 0,
    pageSize: PAGE_SIZE,
    attributeColumns: [],
    referenceFilters: []
};

describe('Ideas list git columns performance', () => {
    let store: SqliteIndexStore | undefined;

    afterEach(async () => {
        await store?.close();
        store = undefined;
        vi.restoreAllMocks();
    });

    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_columns_performance]
    test('listIdeasPage reads indexed git columns without running the analyser', async () => {
        store = await seedLargeIdeasIndex();
        const updateSpy = vi.spyOn(store, 'updateGitDates').mockImplementation(async () => {
            throw new Error('listIdeasPage must not fill git dates');
        });

        const rows = await store.listIdeasPage({
            ...baseQuery,
            sortBy: 'gitModifiedAt',
            sortDir: 'desc'
        });
        expect(rows).toHaveLength(PAGE_SIZE);
        expect(rows.every(row =>
            row.gitCreatedAt
            && row.gitModifiedAt
            && row.gitChangeCount !== undefined
        )).toBe(true);
        expect(updateSpy).not.toHaveBeenCalled();
    }, 60_000);

    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_columns_performance]
    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
    test('indexed git page load stays interactive and under simulated git-per-row cost', async () => {
        store = await seedLargeIdeasIndex();
        const total = await store.countIdeas(baseQuery);
        expect(total).toBe(IDEA_COUNT);

        // Warm query plans.
        await store.listIdeasPage({ ...baseQuery, sortBy: 'path' });
        await store.listIdeasPage({ ...baseQuery, sortBy: 'gitModifiedAt', sortDir: 'desc' });

        const pathSamples: number[] = [];
        const gitSamples: number[] = [];
        for (let trial = 0; trial < 5; trial++) {
            const pathStarted = performance.now();
            const pathRows = await store.listIdeasPage({ ...baseQuery, sortBy: 'path' });
            pathSamples.push(performance.now() - pathStarted);
            expect(pathRows).toHaveLength(PAGE_SIZE);

            const gitStarted = performance.now();
            const gitRows = await store.listIdeasPage({
                ...baseQuery,
                sortBy: 'gitModifiedAt',
                sortDir: 'desc'
            });
            gitSamples.push(performance.now() - gitStarted);
            expect(gitRows).toHaveLength(PAGE_SIZE);
            expect(gitRows[0]?.gitModifiedAt).toBeTruthy();
        }

        const pathMs = median(pathSamples);
        const gitMs = median(gitSamples);
        // Absolute budget: rusqlite + fanout chips on CI hosts.
        expect(gitMs).toBeLessThan(2_500);
        // Git-column sort must stay in the same band as path sort (indexed, not analyser).
        expect(gitMs).toBeLessThan(pathMs * 3 + 100);
        // Even a generous 5ms/row live git walk for the page would be ~250ms floor;
        // indexed reads must stay clearly cheaper than that class of work at scale.
        const simulatedGitPageMs = PAGE_SIZE * 5;
        expect(gitMs).toBeLessThan(Math.max(simulatedGitPageMs, pathMs * 2));
    }, 60_000);

    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_columns_performance]
    // rq:["../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    test('listIdeaIdsMissingGitDates stays fast on a large filled index', async () => {
        store = await seedLargeIdeasIndex();
        // Warm.
        await store.listIdeaIdsMissingGitDates(40);

        const samples: number[] = [];
        for (let trial = 0; trial < 5; trial++) {
            const started = performance.now();
            const ids = await store.listIdeaIdsMissingGitDates(40);
            samples.push(performance.now() - started);
            expect(ids).toEqual([]);
        }
        expect(median(samples)).toBeLessThan(500);
    }, 60_000);

    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_columns_performance]
    test('git change-count sort page stays within absolute budget', async () => {
        store = await seedLargeIdeasIndex();
        await store.listIdeasPage({ ...baseQuery, sortBy: 'gitChangeCount', sortDir: 'desc' });

        const samples: number[] = [];
        for (let trial = 0; trial < 5; trial++) {
            const started = performance.now();
            const rows = await store.listIdeasPage({
                ...baseQuery,
                sortBy: 'gitChangeCount',
                sortDir: 'desc'
            });
            samples.push(performance.now() - started);
            expect(rows[0]?.gitChangeCount).toBeGreaterThanOrEqual(rows.at(-1)?.gitChangeCount ?? 0);
        }
        expect(median(samples)).toBeLessThan(2_500);
    }, 60_000);
});

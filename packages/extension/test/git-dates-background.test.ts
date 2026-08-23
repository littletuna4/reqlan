/**
 * Tests for silent background git_dates indexing (batched, yielded, not on-the-fly).
 * rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
 * rq:["../../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
 * rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_rate_cap]
 * rq:["../../../reqlan rq/core_analysis/core.rq".consumption_silence]
 */
import { describe, expect, test } from 'vitest';
import {
    GIT_DATES_BG_BATCH_SIZE,
    GIT_DATES_BG_MAX_PER_WAVE,
    gitDatesScheduleDelayMs,
    runGitDatesBackgroundWave,
    takePreferredIdeaIds
} from '../src/extension/git-dates-background.js';

describe('git dates background indexing', () => {
    // rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    test('does nothing when the index is not ready', async () => {
        const runAnalyser = async (): Promise<void> => {
            throw new Error('should not run');
        };
        const result = await runGitDatesBackgroundWave({
            isReady: () => false,
            listMissing: async () => ['a', 'b'],
            attempted: new Set(),
            runAnalyser,
            delay: async () => undefined
        });
        expect(result).toEqual({ processed: 0, batches: 0 });
    });

    // rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    test('processes missing ids in small batches and yields between them', async () => {
        const missing = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const batches: string[][] = [];
        const yields: number[] = [];
        const attempted = new Set<string>();

        const result = await runGitDatesBackgroundWave({
            isReady: () => true,
            listMissing: async limit => missing.filter(id => !attempted.has(id)).slice(0, limit),
            attempted,
            runAnalyser: async ideaIds => {
                batches.push([...ideaIds]);
            },
            delay: async ms => {
                yields.push(ms);
            },
            batchSize: 3,
            maxPerWave: 60,
            yieldMs: 50
        });

        expect(batches).toEqual([['a', 'b', 'c'], ['d', 'e', 'f'], ['g']]);
        expect(result.processed).toBe(7);
        expect(result.batches).toBe(3);
        expect(yields).toEqual([50, 50]);
        expect(attempted.size).toBe(7);
        expect(GIT_DATES_BG_BATCH_SIZE).toBe(3);
    });

    // rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    test('skips already-attempted ids and respects the wave cap', async () => {
        const attempted = new Set<string>(['skip-me']);
        const seen: string[] = [];
        const ids = Array.from({ length: 20 }, (_, index) => `id-${index}`);

        const result = await runGitDatesBackgroundWave({
            isReady: () => true,
            listMissing: async limit =>
                ['skip-me', ...ids].filter(id => !attempted.has(id)).slice(0, limit),
            attempted,
            runAnalyser: async ideaIds => {
                seen.push(...ideaIds);
            },
            delay: async () => undefined,
            batchSize: 4,
            maxPerWave: 10,
            yieldMs: 1
        });

        expect(seen).not.toContain('skip-me');
        expect(result.processed).toBe(10);
        expect(result.processed).toBeLessThanOrEqual(GIT_DATES_BG_MAX_PER_WAVE);
        expect(attempted.has('skip-me')).toBe(true);
        expect(seen).toHaveLength(10);
    });

    // rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    test('marks ids attempted even when the analyser fails', async () => {
        const attempted = new Set<string>();
        await runGitDatesBackgroundWave({
            isReady: () => true,
            listMissing: async () => ['failing'],
            attempted,
            runAnalyser: async () => {
                throw new Error('git failed');
            },
            delay: async () => undefined
        });
        expect(attempted.has('failing')).toBe(true);

        const second = await runGitDatesBackgroundWave({
            isReady: () => true,
            listMissing: async () => ['failing'],
            attempted,
            runAnalyser: async () => {
                throw new Error('should not run again');
            },
            delay: async () => undefined
        });
        expect(second.processed).toBe(0);
    });

    // rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    test('processes active-file priority ids before the global backlog', async () => {
        const attempted = new Set<string>();
        const seen: string[] = [];
        const priority = ['cur-a', 'cur-b'];
        const backlog = ['other-1', 'other-2', 'other-3', 'other-4'];

        const result = await runGitDatesBackgroundWave({
            isReady: () => true,
            listPriorityMissing: async limit =>
                priority.filter(id => !attempted.has(id)).slice(0, limit),
            listMissing: async limit =>
                backlog.filter(id => !attempted.has(id)).slice(0, limit),
            attempted,
            runAnalyser: async ideaIds => {
                seen.push(...ideaIds);
            },
            delay: async () => undefined,
            batchSize: 3,
            maxPerWave: 5,
            yieldMs: 1
        });

        expect(seen.slice(0, 2)).toEqual(['cur-a', 'cur-b']);
        expect(seen).toEqual(['cur-a', 'cur-b', 'other-1', 'other-2', 'other-3']);
        expect(result.processed).toBe(5);
        expect(takePreferredIdeaIds(['a', 'b'], ['b', 'c'], 2)).toEqual(['a', 'b']);
    });

    // rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    test('stops early when shouldStop flips so a new file can be prioritised', async () => {
        const attempted = new Set<string>();
        const seen: string[] = [];
        let stop = false;
        const ids = Array.from({ length: 12 }, (_, index) => `id-${index}`);

        const result = await runGitDatesBackgroundWave({
            isReady: () => true,
            listMissing: async limit => ids.filter(id => !attempted.has(id)).slice(0, limit),
            shouldStop: () => stop,
            attempted,
            runAnalyser: async ideaIds => {
                seen.push(...ideaIds);
                stop = true;
            },
            delay: async () => undefined,
            batchSize: 3,
            maxPerWave: 60,
            yieldMs: 1
        });

        expect(result.processed).toBe(3);
        expect(seen).toEqual(['id-0', 'id-1', 'id-2']);
    });
});

describe('git dates schedule delay', () => {
    // rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_rate_cap]
    test('catalog events debounce and do not follow the short editor delay', () => {
        expect(
            gitDatesScheduleDelayMs({
                reason: 'catalog',
                nowMs: 100_000,
                catalogDebounceMs: 10_000,
                editorDebounceMs: 1_500,
                minWaveGapMs: 45_000
            })
        ).toBe(10_000);
        expect(
            gitDatesScheduleDelayMs({
                reason: 'editor',
                nowMs: 100_000,
                catalogDebounceMs: 10_000,
                editorDebounceMs: 1_500,
                minWaveGapMs: 45_000
            })
        ).toBe(1_500);
        expect(
            gitDatesScheduleDelayMs({
                reason: 'continue',
                nowMs: 100_000,
                lastFilledWaveAtMs: 99_000,
                catalogDebounceMs: 10_000,
                editorDebounceMs: 1_500,
                minWaveGapMs: 45_000
            })
        ).toBe(1_500);
    });

    // rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_rate_cap]
    test('catalog waves wait for the min gap after a fill', () => {
        expect(
            gitDatesScheduleDelayMs({
                reason: 'catalog',
                nowMs: 20_000,
                lastFilledWaveAtMs: 10_000,
                catalogDebounceMs: 10_000,
                editorDebounceMs: 1_500,
                minWaveGapMs: 45_000
            })
        ).toBe(35_000);
        expect(
            gitDatesScheduleDelayMs({
                reason: 'catalog',
                nowMs: 60_000,
                lastFilledWaveAtMs: 10_000,
                catalogDebounceMs: 10_000,
                editorDebounceMs: 1_500,
                minWaveGapMs: 45_000
            })
        ).toBe(10_000);
    });
});

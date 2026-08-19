/**
 * Tests for git-context history helpers and hidden git CLI spawns.
 * rq:["../../reqlan rq/extension/module/context-scope.rq".git_context]
 * rq:["../../reqlan rq/core_analysis/core.rq".consumption_silence]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
    buildGitSummary,
    buildHistoryCue,
    formatRelativeAge,
    parseGitLogRecords,
    rollupAuthors,
    shouldRefreshGitFocusCache
} from '../src/activity_bar_module/git-context-helpers.js';

const gitContextSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src/activity_bar_module/git-context.ts'),
    'utf8'
);

describe('git-context history helpers', () => {
    test('parseGitLogRecords reads null-delimited commits', () => {
        const stdout = [
            ['aaaa', 'aaa', 'Add feature', 'Ada', '2026-07-01T12:00:00Z'].join('\0'),
            ['bbbb', 'bbb', 'Fix bug', 'Ada', '2026-07-02T12:00:00Z'].join('\0')
        ].join('\n');
        const commits = parseGitLogRecords(stdout);
        expect(commits).toHaveLength(2);
        expect(commits[0]).toMatchObject({
            hash: 'aaaa',
            shortHash: 'aaa',
            subject: 'Add feature',
            author: 'Ada'
        });
    });

    test('parseGitLogRecords ignores malformed lines', () => {
        expect(parseGitLogRecords('not-a-record\n')).toEqual([]);
        expect(parseGitLogRecords('')).toEqual([]);
    });

    test('rollupAuthors sorts by commit count', () => {
        const authors = rollupAuthors([
            {
                hash: '1',
                shortHash: '1',
                subject: 'a',
                author: 'Ada',
                authoredAt: '2026-01-01T00:00:00Z'
            },
            {
                hash: '2',
                shortHash: '2',
                subject: 'b',
                author: 'Bob',
                authoredAt: '2026-01-02T00:00:00Z'
            },
            {
                hash: '3',
                shortHash: '3',
                subject: 'c',
                author: 'Ada',
                authoredAt: '2026-01-03T00:00:00Z'
            }
        ]);
        expect(authors[0]).toEqual({ name: 'Ada', commitCount: 2 });
        expect(authors[1]).toEqual({ name: 'Bob', commitCount: 1 });
    });

    test('buildGitSummary prefers history over dirty counts', () => {
        expect(
            buildGitSummary({
                branch: 'main',
                headShort: 'abc1234',
                commits: [
                    {
                        hash: '1',
                        shortHash: '1',
                        subject: 'x',
                        author: 'Ada',
                        authoredAt: '2026-07-01T00:00:00Z'
                    }
                ],
                authors: [{ name: 'Ada', commitCount: 1 }],
                dirtyCount: 5
            })
        ).toBe('main · 1 commit · 1 author');

        expect(
            buildGitSummary({
                branch: 'main',
                headShort: 'abc1234',
                commits: [],
                authors: [],
                dirtyCount: 3
            })
        ).toBe('main · 3 dirty');

        expect(
            buildGitSummary({
                branch: undefined,
                headShort: undefined,
                commits: [],
                authors: [],
                dirtyCount: 0
            })
        ).toBe('No repo');
    });

    test('buildHistoryCue and formatRelativeAge', () => {
        const now = new Date('2026-07-26T00:00:00Z');
        expect(formatRelativeAge('2026-07-26T00:00:00Z', now)).toBe('today');
        expect(formatRelativeAge('2026-07-24T00:00:00Z', now)).toBe('2d ago');
        expect(
            buildHistoryCue({
                branch: 'main',
                commits: [
                    {
                        hash: '1',
                        shortHash: '1',
                        subject: 'x',
                        author: 'Ada',
                        authoredAt: '2026-07-24T00:00:00Z'
                    }
                ],
                now
            })
        ).toBe('2d ago · main');
        expect(buildHistoryCue({ branch: 'main', commits: [] })).toBe('main');
    });

    test('shouldRefreshGitFocusCache refreshes only when cache is before latest commit', () => {
        const latest = Date.parse('2026-08-01T12:00:00Z');
        expect(shouldRefreshGitFocusCache(Date.parse('2026-07-31T12:00:00Z'), latest)).toBe(true);
        expect(shouldRefreshGitFocusCache(Date.parse('2026-08-01T12:00:00Z'), latest)).toBe(false);
        expect(shouldRefreshGitFocusCache(Date.parse('2026-08-02T12:00:00Z'), latest)).toBe(false);
        expect(shouldRefreshGitFocusCache(Date.now(), undefined)).toBe(false);
    });

    // rq:["../../reqlan rq/core_analysis/core.rq".consumption_silence]
    test('git CLI spawns hide the Windows console', () => {
        expect(gitContextSource).toContain('withHiddenConsole');
        expect(gitContextSource).toMatch(/execFileAsync\(\s*'git'/);
        expect(gitContextSource).not.toMatch(
            /execFileAsync\(\s*'git',\s*args,\s*\{\s*cwd/
        );
    });
});

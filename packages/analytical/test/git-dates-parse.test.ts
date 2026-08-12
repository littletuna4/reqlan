/**
 * Guards for parsing ISO author dates from git log (ignore patch noise).
 * rq:["../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
 * rq:["../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
 * rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_date_format]
 */
import { describe, expect, test } from 'vitest';
import { parseGitAuthorDates } from '../src/analysis/git-dates-analyser.js';

describe('parseGitAuthorDates', () => {
    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_date_format]
    test('keeps only ISO author-date lines from git -L output with patch noise', () => {
        const stdout = [
            '2026-08-03T21:01:00+10:00',
            '',
            'diff --git a/packages/analytical/src/analysis/git-dates-analyser.ts b/packages/analytical/src/analysis/git-dates-analyser.ts',
            '--- a/packages/analytical/src/analysis/git-dates-analyser.ts',
            '+++ b/packages/analytical/src/analysis/git-dates-analyser.ts',
            '@@ -41,0 +66,11 @@',
            '+            { cwd, timeout: GIT_LOG_TIMEOUT_MS }',
            '2024-01-15T09:00:00Z',
            '+                createdAt: lineDates[lineDates.length - 1]'
        ].join('\n');

        expect(parseGitAuthorDates(stdout)).toEqual([
            '2026-08-03T21:01:00+10:00',
            '2024-01-15T09:00:00Z'
        ]);
    });

    test('returns empty for blank or non-date output', () => {
        expect(parseGitAuthorDates('')).toEqual([]);
        expect(parseGitAuthorDates('diff --git a/foo b/foo\n+++ b/foo')).toEqual([]);
    });
});

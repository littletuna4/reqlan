/**
 * Format guards for Ideas table first-committed / last-modified cells.
 * rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
 * rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_date_format]
 */
import { describe, expect, test } from 'vitest';
import { formatGitDate } from '../webviews/ideas-summary/lib/format-git-date.js';

describe('formatGitDate', () => {
    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_date_format]
    test('formats git %aI timestamps as YYYY-MM-DD', () => {
        expect(formatGitDate('2026-08-03T21:01:00+10:00')).toBe('2026-08-03');
        expect(formatGitDate('2024-01-01T00:00:00Z')).toBe('2024-01-01');
        expect(formatGitDate('2024-12-31T23:30:00-05:00')).toBe('2024-12-31');
        expect(formatGitDate(' 2025-06-15T12:00:00+00:00 ')).toBe('2025-06-15');
    });

    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_date_format]
    test('keeps authored calendar day (does not shift across timezone)', () => {
        // Midnight +10 would become the previous UTC day if converted via toISOString alone.
        expect(formatGitDate('2024-01-01T00:00:00+10:00')).toBe('2024-01-01');
        expect(formatGitDate('2024-01-01T00:30:00+10:00')).toBe('2024-01-01');
    });

    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_date_format]
    test('renders empty and invalid values as an em dash', () => {
        expect(formatGitDate(undefined)).toBe('—');
        expect(formatGitDate(null)).toBe('—');
        expect(formatGitDate('')).toBe('—');
        expect(formatGitDate('   ')).toBe('—');
        expect(formatGitDate('diff --git a/foo b/foo')).toBe('—');
        expect(formatGitDate('+                createdAt: lineDates[lineDates.length - 1]')).toBe('—');
        expect(formatGitDate('not-a-date')).toBe('—');
    });
});

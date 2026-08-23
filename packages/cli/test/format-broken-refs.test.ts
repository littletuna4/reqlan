/**
 * rq:["../../../reqlan rq/core_analysis/check.rq".check]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
 */
import { describe, expect, test } from 'vitest';
import { formatCheckIssues, formatCheckPipe, formatPathWithLine } from '../src/format-broken-refs.js';

describe('format broken refs', () => {
    test('quotes paths that contain spaces', () => {
        // rq:["../../../reqlan rq/core_analysis/check.rq".check]
        expect(formatPathWithLine('reqlan rq/core_analysis/check.rq', 12)).toBe(
            '"reqlan rq/core_analysis/check.rq":12'
        );
        expect(formatPathWithLine('packages/cli/src/commands/check.ts', 3)).toBe(
            'packages/cli/src/commands/check.ts:3'
        );
        const pipe = formatCheckPipe([
            {
                fileUri: 'reqlan rq/core_analysis/check.rq',
                sourceName: 'check',
                kind: 'references',
                label: 'missing_idea',
                sourceLine: 11
            }
        ]);
        expect(pipe).toBe(
            '"reqlan rq/core_analysis/check.rq":12 check [references] missing_idea'
        );
    });

    test('groups rows that share a missing target under one heading', () => {
        // rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
        const text = formatCheckIssues([
            {
                fileUri: 'a/one.rq',
                sourceName: 'one',
                kind: 'references',
                label: 'shared_missing',
                sourceLine: 1
            },
            {
                fileUri: 'b/two.rq',
                sourceName: 'two',
                kind: 'references',
                label: 'shared_missing',
                sourceLine: 1
            },
            {
                fileUri: 'a/one.rq',
                sourceName: 'one',
                kind: 'references',
                label: 'zebra_missing',
                sourceLine: 2
            }
        ]);
        expect(text).toBe(
            [
                '## Issues (3)',
                '',
                'shared_missing',
                '- a/one.rq:2 one [references]',
                '- b/two.rq:2 two [references]',
                '',
                'zebra_missing',
                '- a/one.rq:3 one [references]'
            ].join('\n')
        );
    });

    test('marks wildcard sparse rows as warnings', () => {
        // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
        const text = formatCheckIssues([
            {
                fileUri: 'host.rq',
                sourceName: 'host',
                kind: 'wildcard_reference',
                label: 'mods/*.rq.missing_*',
                sourceLine: 1,
                severity: 'warning',
                matchCount: 0
            }
        ]);
        expect(text).toContain('mods/*.rq.missing_*');
        expect(text).toContain('[wildcard_reference] warning 0 matches');
        const pipe = formatCheckPipe([
            {
                fileUri: 'host.rq',
                sourceName: 'host',
                kind: 'wildcard_reference',
                label: 'mods/*.rq.widget_a*',
                sourceLine: 2,
                severity: 'warning',
                matchCount: 1
            }
        ]);
        expect(pipe).toBe('host.rq:3 host [wildcard_reference] warning 1 match mods/*.rq.widget_a*');
    });
});

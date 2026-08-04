/**
 * Bases table client-side search / column filters.
 * per ["../../reqlan rq/extension/module/ideas_summary/webview.rq".bases_tab]
 * per ["../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_filters]
 */
import { describe, expect, test } from 'vitest';
import type { BaseStatusView } from '../src/webview_module/shared/messages.js';
import { matchesBase } from '../webviews/ideas-summary/lib/bases-filter.js';

function base(overrides: Partial<BaseStatusView> = {}): BaseStatusView {
    return {
        id: 'a',
        label: 'alpha',
        root: '/ws/alpha',
        ready: true,
        ideaCount: 10,
        edgeCount: 20,
        fileIssueCount: 0,
        state: 'ready',
        ...overrides
    };
}

describe('matchesBase', () => {
    test('global search matches label, path, or state', () => {
        const rows = [
            base({ id: '1', label: 'core', root: '/ws/core' }),
            base({ id: '2', label: 'docs', root: '/ws/docs', state: 'syncing' })
        ];
        expect(rows.filter(row => matchesBase(row, 'core', []))).toHaveLength(1);
        expect(rows.filter(row => matchesBase(row, 'docs', []))[0]?.id).toBe('2');
        expect(rows.filter(row => matchesBase(row, 'sync', []))[0]?.id).toBe('2');
        expect(rows.filter(row => matchesBase(row, 'missing', []))).toHaveLength(0);
    });

    test('column filters combine with search', () => {
        const rows = [
            base({ id: '1', label: 'core', ready: true }),
            base({ id: '2', label: 'core-wip', ready: false, root: '/ws/wip' })
        ];
        const filtered = rows.filter(row =>
            matchesBase(row, 'core', [{ column: 'ready', selected: ['yes'] }])
        );
        expect(filtered.map(row => row.id)).toEqual(['1']);
    });

    test('empty search and filters keep all rows', () => {
        const rows = [base(), base({ id: 'b', label: 'beta' })];
        expect(rows.filter(row => matchesBase(row, '', []))).toHaveLength(2);
        expect(rows.filter(row => matchesBase(row, '   ', []))).toHaveLength(2);
    });
});

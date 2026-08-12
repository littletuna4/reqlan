/**
 * Table column filter / search text normalization for Ideas Summary.
 * per ["../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_filters]
 */
import { describe, expect, test } from 'vitest';
import {
    normalizeColumnFilters,
    preserveFilterText
} from '../src/webview_module/shared/table-query-normalize.js';

describe('preserveFilterText', () => {
    test('keeps interior and trailing spaces', () => {
        expect(preserveFilterText('foo ')).toBe('foo ');
        expect(preserveFilterText('foo bar')).toBe('foo bar');
        expect(preserveFilterText('  leading')).toBe('  leading');
    });

    test('drops only empty string / undefined', () => {
        expect(preserveFilterText('')).toBeUndefined();
        expect(preserveFilterText(undefined)).toBeUndefined();
        expect(preserveFilterText('   ')).toBe('   ');
    });
});

describe('normalizeColumnFilters', () => {
    test('preserves spaces in text filters', () => {
        expect(normalizeColumnFilters([{ column: 'title', text: 'idea ' }])).toEqual([
            { column: 'title', text: 'idea ', selected: undefined }
        ]);
    });

    test('keeps empty selected cleared and drops empty filters', () => {
        expect(normalizeColumnFilters([
            { column: 'kind', selected: ['block'] },
            { column: 'title', text: '' },
            { column: 'path', selected: [] }
        ])).toEqual([
            { column: 'kind', text: undefined, selected: ['block'] }
        ]);
    });

    test('cleared select (no selected) is removed so deselect returns to All', () => {
        expect(normalizeColumnFilters([
            { column: 'kind', selected: [] }
        ])).toEqual([]);
    });
});

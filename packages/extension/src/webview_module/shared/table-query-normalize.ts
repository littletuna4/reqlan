/**
 * Preserve / normalize table query filters for Ideas Summary.
 * per ["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_filters]
 */
import type { ColumnFilter } from './messages.js';

/**
 * Preserve typed search/filter text through the host round-trip.
 * Do not trim: trimming collapses "foo " → "foo" and blocks spaces in controlled inputs.
 * SQL matchers already treat whitespace-only as empty via their own `.trim()` checks.
 */
export function preserveFilterText(text: string | undefined): string | undefined {
    if (text === undefined || text === '') {
        return undefined;
    }
    return text;
}

export function normalizeColumnFilters(
    filters: ColumnFilter[] | undefined
): ColumnFilter[] {
    if (!filters?.length) {
        return [];
    }
    return filters
        .filter(filter => typeof filter.column === 'string' && filter.column.length > 0)
        .map(filter => ({
            column: filter.column,
            text: preserveFilterText(filter.text),
            selected: filter.selected?.filter(value => value.length > 0)
        }))
        .filter(filter => filter.text !== undefined || (filter.selected?.length ?? 0) > 0);
}

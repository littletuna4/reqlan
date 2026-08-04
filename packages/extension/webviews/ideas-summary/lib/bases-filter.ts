/**
 * Client-side filter for the Bases table.
 * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".bases_tab]
 * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_filters]
 */
import type { BaseStatusView, ColumnFilter } from '../../../src/webview_module/shared/messages.js';

export function matchesBase(
    base: BaseStatusView,
    search: string,
    columnFilters: ColumnFilter[]
): boolean {
    const haystack = `${base.label} ${base.root} ${base.state}`.toLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) {
        return false;
    }
    for (const filter of columnFilters) {
        if (filter.column === 'label' && filter.text?.trim()) {
            if (!base.label.toLowerCase().includes(filter.text.trim().toLowerCase())) {
                return false;
            }
        }
        if (filter.column === 'root' && filter.text?.trim()) {
            if (!base.root.toLowerCase().includes(filter.text.trim().toLowerCase())) {
                return false;
            }
        }
        if (filter.column === 'state' && filter.text?.trim()) {
            if (!base.state.toLowerCase().includes(filter.text.trim().toLowerCase())) {
                return false;
            }
        }
        if (filter.column === 'ready' && filter.selected?.length) {
            const readyKey = base.ready ? 'yes' : 'no';
            if (!filter.selected.includes(readyKey)) {
                return false;
            }
        }
    }
    return true;
}

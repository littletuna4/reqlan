/**
 * Helpers for Ideas Summary table column visibility and grouping headers.
 * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_options]
 */

export function isColumnVisible(visibleColumns: string[], id: string): boolean {
    return visibleColumns.includes(id);
}

export interface GroupHeader {
    key: string;
    label: string;
    startIndex: number;
}

/** Build group headers for consecutive rows sharing a group key. */
export function buildGroupHeaders<T>(
    rows: T[],
    keyOf: (row: T) => string,
    labelOf: (key: string) => string = key => key
): GroupHeader[] {
    const headers: GroupHeader[] = [];
    let lastKey: string | undefined;
    rows.forEach((row, index) => {
        const key = keyOf(row);
        if (key !== lastKey) {
            headers.push({ key, label: labelOf(key), startIndex: index });
            lastKey = key;
        }
    });
    return headers;
}

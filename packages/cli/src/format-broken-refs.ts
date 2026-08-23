/**
 * Shared formatters for unresolved-reference rows.
 * rq:["../../../reqlan rq/core_analysis/check.rq".check]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
 * rq:["../../../reqlan rq/core_analysis/core.rq".test_references]
 */

export interface BrokenRefRow {
    fileUri: string;
    sourceName?: string | null;
    kind: string;
    label: string;
    sourceLine?: number | null;
    severity?: string | null;
    matchCount?: number | null;
}

export function formatBrokenRefs(rows: BrokenRefRow[]): string {
    if (rows.length === 0) {
        return '## Broken references\n(none)';
    }
    const lines = rows.map(row => formatBrokenRefLine(row, '- '));
    return `## Broken references (${rows.length})\n${lines.join('\n')}`;
}

export function formatCheckIssues(rows: BrokenRefRow[]): string {
    if (rows.length === 0) {
        return 'No issues.';
    }
    const parts: string[] = [`## Issues (${rows.length})`];
    let lastLabel: string | undefined;
    for (const row of rows) {
        if (row.label !== lastLabel) {
            parts.push('');
            parts.push(row.label);
            lastLabel = row.label;
        }
        const line = (row.sourceLine ?? 0) + 1;
        const source = row.sourceName ? ` ${row.sourceName}` : '';
        parts.push(`- ${formatPathWithLine(row.fileUri, line)}${source} ${formatKindSuffix(row)}`);
    }
    return parts.join('\n');
}

export function formatCheckPipe(rows: BrokenRefRow[]): string {
    return rows.map(row => formatBrokenRefLine(row, '')).join('\n');
}

function formatBrokenRefLine(row: BrokenRefRow, prefix: string): string {
    const line = (row.sourceLine ?? 0) + 1;
    const source = row.sourceName ? ` ${row.sourceName}` : '';
    return `${prefix}${formatPathWithLine(row.fileUri, line)}${source} ${formatKindSuffix(row)} ${row.label}`;
}

function formatKindSuffix(row: BrokenRefRow): string {
    const warning = row.severity === 'warning' ? ' warning' : '';
    const count =
        row.matchCount === 0
            ? ' 0 matches'
            : row.matchCount === 1
              ? ' 1 match'
              : '';
    return `[${row.kind}]${warning}${count}`;
}

/** Quote a path when it contains spaces or other characters that break `path:line`. */
export function formatPathWithLine(fileUri: string, line: number): string {
    if (isSafeUnquotedPath(fileUri)) {
        return `${fileUri}:${line}`;
    }
    const escaped = fileUri.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}":${line}`;
}

function isSafeUnquotedPath(fileUri: string): boolean {
    return /^[A-Za-z0-9._/\-]+$/.test(fileUri);
}

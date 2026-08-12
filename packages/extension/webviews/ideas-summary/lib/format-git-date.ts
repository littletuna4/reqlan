/**
 * Format indexed idea git timestamps for Ideas Summary table cells.
 * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
 * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list_git_date_format]
 */

/** Author-date prefix from git `%aI` (YYYY-MM-DD before T / space). */
const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/;

/**
 * Display first-committed / last-modified cells as `YYYY-MM-DD`.
 * Prefers the authored calendar date from an ISO timestamp so timezone
 * conversion does not shift the day. Invalid or non-date values render as em dash.
 */
export function formatGitDate(value: string | undefined | null): string {
    if (value == null) {
        return '—';
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return '—';
    }
    const match = ISO_DATE_PREFIX.exec(trimmed);
    if (match?.[1]) {
        return match[1];
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
        return '—';
    }
    return new Date(parsed).toISOString().slice(0, 10);
}

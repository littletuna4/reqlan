/**
 * Activity-bar search result count copy.
 * rq:["../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_load_more]
 * rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
 */
export function formatSearchMatchCount(shown: number, truncated: boolean): string {
    if (truncated) {
        return `${shown}+ matches`;
    }
    if (shown === 1) {
        return '1 match';
    }
    return `${shown} matches`;
}

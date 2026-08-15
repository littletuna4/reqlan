/**
 * Activity-bar search match-count copy.
 * rq:["../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_load_more]
 * rq:["../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
 */
import { describe, expect, test } from 'vitest';
import { formatSearchMatchCount } from '../src/activity_bar_module/search-results-meta.js';

describe('formatSearchMatchCount', () => {
    test('shows exceeded counts as n+ rather than a full total', () => {
        expect(formatSearchMatchCount(40, true)).toBe('40+ matches');
        expect(formatSearchMatchCount(73, true)).toBe('73+ matches');
    });

    test('shows an exact count when the page is complete', () => {
        expect(formatSearchMatchCount(1, false)).toBe('1 match');
        expect(formatSearchMatchCount(12, false)).toBe('12 matches');
        expect(formatSearchMatchCount(0, false)).toBe('0 matches');
    });
});

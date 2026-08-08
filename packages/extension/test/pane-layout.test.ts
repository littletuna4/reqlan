import { describe, expect, test } from 'vitest';
import {
    clampPaneHeight,
    countExpanded,
    DEFAULT_PANE_HEIGHTS,
    MAX_PANE_HEIGHT,
    mergePaneHeights,
    MIN_PANE_HEIGHT,
    paneBodyHeight,
    paneFlexGrow,
    shouldFillAlone
} from '../webviews/activity-bar/lib/pane-layout.js';

describe('pane-layout', () => {
    test('countExpanded and shouldFillAlone', () => {
        expect(countExpanded({ a: true, b: false, c: true })).toBe(2);
        expect(shouldFillAlone({ a: true, b: false, c: false })).toBe(true);
        expect(shouldFillAlone({ a: true, b: true })).toBe(false);
        expect(shouldFillAlone({ a: false, b: false })).toBe(false);
    });

    test('clampPaneHeight respects min/max', () => {
        expect(clampPaneHeight(10)).toBe(MIN_PANE_HEIGHT);
        expect(clampPaneHeight(9999)).toBe(MAX_PANE_HEIGHT);
        expect(clampPaneHeight(200.7)).toBe(201);
        expect(clampPaneHeight(Number.NaN)).toBe(MIN_PANE_HEIGHT);
    });

    test('mergePaneHeights overlays saved values', () => {
        const merged = mergePaneHeights(DEFAULT_PANE_HEIGHTS, { scope: 400, bogus: Number.NaN });
        expect(merged.scope).toBe(400);
        expect(merged.workspace).toBe(DEFAULT_PANE_HEIGHTS.workspace);
        expect(merged.bogus).toBeUndefined();
    });

    test('paneFlexGrow returns weight for expanded panes only', () => {
        const heights = { scope: 300 };
        expect(paneFlexGrow('scope', false, heights)).toBeUndefined();
        expect(paneFlexGrow('scope', true, heights)).toBe(300);
        expect(paneFlexGrow('unknown', true, {})).toBe(200);
    });

    test('paneBodyHeight stays compatible for multi-open resize weights', () => {
        const heights = { scope: 300 };
        expect(paneBodyHeight('scope', false, false, heights)).toBeUndefined();
        expect(paneBodyHeight('scope', true, true, heights)).toBeUndefined();
        expect(paneBodyHeight('scope', true, false, heights)).toBe(300);
    });
});

import { describe, expect, test } from 'vitest';
import {
    GRAPH_LABEL_FADE_END,
    GRAPH_LABEL_FADE_START,
    labelOpacityForMode
} from '../webviews/shared/graph/graph-cy-controller.js';

describe('labelOpacityForMode', () => {
    test('on is always opaque and off is always hidden', () => {
        expect(labelOpacityForMode('on', 0.01)).toBe(1);
        expect(labelOpacityForMode('on', 2)).toBe(1);
        expect(labelOpacityForMode('off', 0.01)).toBe(0);
        expect(labelOpacityForMode('off', 2)).toBe(0);
    });

    test('auto ramps continuously between fade start and end', () => {
        expect(labelOpacityForMode('auto', GRAPH_LABEL_FADE_START)).toBe(0);
        expect(labelOpacityForMode('auto', GRAPH_LABEL_FADE_START - 0.1)).toBe(0);
        expect(labelOpacityForMode('auto', GRAPH_LABEL_FADE_END)).toBe(1);
        expect(labelOpacityForMode('auto', GRAPH_LABEL_FADE_END + 0.1)).toBe(1);
        const mid = (GRAPH_LABEL_FADE_START + GRAPH_LABEL_FADE_END) / 2;
        const midOpacity = labelOpacityForMode('auto', mid);
        expect(midOpacity).toBeGreaterThan(0.4);
        expect(midOpacity).toBeLessThan(0.6);
    });
});

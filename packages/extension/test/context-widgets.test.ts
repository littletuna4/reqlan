import { describe, expect, test } from 'vitest';
import {
    hopDistancesFromCenter,
    hotspotBorderColor,
    hotspotBorderWidth,
    impactOpacityForHopDistance
} from '../webviews/shared/graph/graph-theme.js';

describe('context widget / graph helpers', () => {
    test('hotspot border scales with band', () => {
        expect(hotspotBorderWidth('high')).toBeGreaterThan(hotspotBorderWidth('low'));
        expect(hotspotBorderColor('high')).toBe('#f14c4c');
    });

    test('impact opacity fades with hop distance', () => {
        const distances = hopDistancesFromCenter('a', [
            { sourceId: 'a', targetId: 'b' },
            { sourceId: 'b', targetId: 'c' }
        ]);
        expect(impactOpacityForHopDistance(distances.get('a'))).toBe(1);
        expect(impactOpacityForHopDistance(distances.get('c'))).toBe(0.45);
        expect(impactOpacityForHopDistance(undefined)).toBe(0.2);
    });
});

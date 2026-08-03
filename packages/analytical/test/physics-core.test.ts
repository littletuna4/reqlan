import { describe, expect, test } from 'vitest';
import {
    DEFAULT_PHYSICS_SETTINGS,
    hashAngle,
    stepPhysics,
    type PhysicsStepState
} from '../src/graph/physics-core.js';

function makeState(count: number, edges: Array<{ sourceId: string; targetId: string }> = []): PhysicsStepState {
    const ids = Array.from({ length: count }, (_, i) => `n${i}`);
    const xs = new Float64Array(count);
    const ys = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
        xs[i] = (i % 10) * 40;
        ys[i] = Math.floor(i / 10) * 40;
    }
    return {
        ids,
        xs,
        ys,
        fxs: new Float64Array(count),
        fys: new Float64Array(count),
        velocities: new Map(),
        pinnedIds: new Set(),
        edges
    };
}

describe('shared graph physics core', () => {
    test('hashAngle is deterministic', () => {
        expect(hashAngle('a+b')).toBe(hashAngle('a+b'));
        expect(hashAngle('a+b')).not.toBe(hashAngle('b+a'));
    });

    test('stepPhysics moves nodes and returns finite speed', () => {
        const state = makeState(12, [
            { sourceId: 'n0', targetId: 'n1' },
            { sourceId: 'n1', targetId: 'n2' }
        ]);
        const before = Float64Array.from(state.xs);
        const speed = stepPhysics(state, DEFAULT_PHYSICS_SETTINGS);
        expect(Number.isFinite(speed)).toBe(true);
        expect(speed).toBeGreaterThanOrEqual(0);
        let moved = false;
        for (let i = 0; i < before.length; i += 1) {
            if (state.xs[i] !== before[i]) moved = true;
        }
        expect(moved).toBe(true);
    });

    test('spatial grid path runs for large graphs', () => {
        const state = makeState(120);
        const speed = stepPhysics(state, DEFAULT_PHYSICS_SETTINGS);
        expect(Number.isFinite(speed)).toBe(true);
    });
});

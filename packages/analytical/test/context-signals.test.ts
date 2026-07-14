import { describe, expect, test } from 'vitest';
import {
    buildAiReadiness,
    buildContextFingerprint,
    buildFocusSignals,
    emptyContextSignals,
    formatAiReadinessMarkdown,
    formatFingerprintMarkdown,
    formatSynthesisMarkdown,
    hopDistancesFromCenter,
    impactOpacityForHopDistance,
    requirementCardCue,
    synthesizeFocusContext,
    thinChurnIntensity
} from '../src/core/context-signals.js';

describe('context signals defaults', () => {
    test('empty signals have no focus', () => {
        expect(emptyContextSignals().focusIdeaId).toBeUndefined();
    });
});

describe('buildFocusSignals', () => {
    test('maps relationship and date fields', () => {
        const now = new Date('2026-07-14T00:00:00Z');
        const signals = buildFocusSignals({
            focusIdeaId: 'a#x',
            status: 'incomplete',
            parentCount: 2,
            inboundCount: 5,
            outboundCount: 3,
            unresolvedCount: 1,
            createdAt: '2024-01-01T00:00:00Z',
            modifiedAt: '2026-07-13T00:00:00Z',
            now
        });
        expect(signals.relationship?.parentCount).toBe(2);
        expect(signals.relationship?.dependentCount).toBe(3);
        expect(signals.developmentHistory?.timeSinceTouchedDays).toBe(1);
        expect(signals.risk?.unresolvedRefs).toBe(true);
        expect(signals.risk?.recentlyTouched).toBe(true);
    });

    test('returns empty when no focus', () => {
        expect(buildFocusSignals({
            parentCount: 0,
            inboundCount: 0,
            outboundCount: 0,
            unresolvedCount: 0
        })).toEqual({});
    });
});

describe('synthesizeFocusContext', () => {
    test('marks old quiet leaf as stable / low risk', () => {
        const signals = buildFocusSignals({
            focusIdeaId: 'stable',
            status: 'done',
            parentCount: 0,
            inboundCount: 1,
            outboundCount: 1,
            unresolvedCount: 0,
            createdAt: '2020-01-01T00:00:00Z',
            modifiedAt: '2025-01-01T00:00:00Z',
            now: new Date('2026-07-14T00:00:00Z')
        });
        const synthesis = synthesizeFocusContext(signals);
        expect(synthesis.stability).toBeGreaterThan(0.7);
        expect(synthesis.aiRisk).toBe('low');
        expect(synthesis.story).toContain('stable');
    });

    test('marks high-fanout recent edit as high risk', () => {
        const signals = buildFocusSignals({
            focusIdeaId: 'hot',
            status: 'incomplete',
            parentCount: 1,
            inboundCount: 20,
            outboundCount: 15,
            unresolvedCount: 2,
            createdAt: '2026-06-01T00:00:00Z',
            modifiedAt: '2026-07-13T00:00:00Z',
            now: new Date('2026-07-14T00:00:00Z')
        });
        const synthesis = synthesizeFocusContext(signals);
        expect(synthesis.stability).toBeLessThan(0.5);
        expect(synthesis.aiRisk).toBe('high');
        expect(synthesis.story.toLowerCase()).toMatch(/unstable|fanout|unresolved/);
    });
});

describe('fingerprint and readiness', () => {
    test('formats markdown exports', () => {
        const signals = buildFocusSignals({
            focusIdeaId: 'a',
            parentCount: 1,
            inboundCount: 2,
            outboundCount: 2,
            unresolvedCount: 0,
            createdAt: '2024-01-01T00:00:00Z',
            modifiedAt: '2024-06-01T00:00:00Z',
            now: new Date('2026-07-14T00:00:00Z')
        });
        const synthesis = synthesizeFocusContext(signals);
        const fingerprint = buildContextFingerprint({
            fileCount: 4,
            ideaCount: 3,
            historyCount: 2,
            hasArchitectureHint: true,
            gitChangeCount: 1,
            anomalyCount: 0,
            coverage: synthesis.coverage
        });
        const readiness = buildAiReadiness(signals, synthesis);
        expect(formatSynthesisMarkdown(synthesis)).toContain('Stability');
        expect(formatFingerprintMarkdown(fingerprint)).toContain('Files');
        expect(formatAiReadinessMarkdown(readiness)).toContain('AI readiness');
    });
});

describe('graph helpers', () => {
    test('hop distances and impact opacity', () => {
        const distances = hopDistancesFromCenter('a', [
            { sourceId: 'a', targetId: 'b' },
            { sourceId: 'b', targetId: 'c' }
        ]);
        expect(distances.get('a')).toBe(0);
        expect(distances.get('b')).toBe(1);
        expect(distances.get('c')).toBe(2);
        expect(impactOpacityForHopDistance(0)).toBe(1);
        expect(impactOpacityForHopDistance(1)).toBe(0.75);
        expect(impactOpacityForHopDistance(3)).toBe(0.2);
    });

    test('requirement card cue and thin churn', () => {
        expect(requirementCardCue(0, 0).label).toBe('Stable');
        expect(requirementCardCue(20, 20).label).toBe('High churn risk');
        const signals = buildFocusSignals({
            focusIdeaId: 'x',
            parentCount: 0,
            inboundCount: 0,
            outboundCount: 0,
            unresolvedCount: 0,
            modifiedAt: new Date().toISOString()
        });
        expect(thinChurnIntensity(signals)).toBeGreaterThan(0.5);
    });
});

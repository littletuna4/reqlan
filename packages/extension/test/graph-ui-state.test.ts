import { describe, expect, test } from 'vitest';
import {
    DEFAULT_GRAPH_UI_STATE,
    normalizeGraphUiState
} from '../src/webview_module/shared/graph-ui-state.js';

describe('normalizeGraphUiState', () => {
    test('returns defaults for empty input', () => {
        expect(normalizeGraphUiState(undefined)).toEqual(DEFAULT_GRAPH_UI_STATE);
        expect(normalizeGraphUiState(null)).toEqual(DEFAULT_GRAPH_UI_STATE);
    });

    test('keeps valid fields and drops unknown node types / layouts', () => {
        const normalized = normalizeGraphUiState({
            showKey: true,
            showControls: true,
            hiddenNodeTypes: ['block', 'not-a-type', 'external'],
            layoutId: 'not-a-layout',
            useCompound: true,
            compoundBasisId: 'tags',
            animatePhysics: true,
            maxNodes: 50,
            truncationBasis: 'git-modified',
            physics: { gravity: 0.01, repulsion: 1000 }
        });
        expect(normalized.showKey).toBe(true);
        expect(normalized.showControls).toBe(true);
        expect(normalized.hiddenNodeTypes).toEqual(['block', 'external']);
        expect(normalized.layoutId).toBe(DEFAULT_GRAPH_UI_STATE.layoutId);
        expect(normalized.compoundBasisId).toBe('tags');
        expect(normalized.animatePhysics).toBe(true);
        expect(normalized.maxNodes).toBe(50);
        expect(normalized.truncationBasis).toBe('git-modified');
        expect(normalized.physics.gravity).toBe(0.01);
        expect(normalized.physics.repulsion).toBe(1000);
        expect(normalized.physics.linkStrength).toBe(DEFAULT_GRAPH_UI_STATE.physics.linkStrength);
    });

    test('clamps maxNodes into 1..1000', () => {
        expect(normalizeGraphUiState({ maxNodes: 0 }).maxNodes).toBe(1);
        expect(normalizeGraphUiState({ maxNodes: 5000 }).maxNodes).toBe(1000);
    });
});

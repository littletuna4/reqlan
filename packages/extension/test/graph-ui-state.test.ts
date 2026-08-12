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
        expect(normalized.labelMode).toBe(DEFAULT_GRAPH_UI_STATE.labelMode);
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

    test('keeps valid labelMode and defaults unknown values to auto', () => {
        expect(normalizeGraphUiState({ labelMode: 'on' }).labelMode).toBe('on');
        expect(normalizeGraphUiState({ labelMode: 'off' }).labelMode).toBe('off');
        expect(normalizeGraphUiState({ labelMode: 'auto' }).labelMode).toBe('auto');
        expect(normalizeGraphUiState({ labelMode: 'nope' }).labelMode).toBe('auto');
        expect(DEFAULT_GRAPH_UI_STATE.labelMode).toBe('auto');
    });

    test('keeps valid fileTreatment and defaults unknown values to linked', () => {
        expect(normalizeGraphUiState({ fileTreatment: 'compound' }).fileTreatment).toBe('compound');
        expect(normalizeGraphUiState({ fileTreatment: 'linked' }).fileTreatment).toBe('linked');
        expect(normalizeGraphUiState({ fileTreatment: 'invisible' }).fileTreatment).toBe('invisible');
        expect(normalizeGraphUiState({ fileTreatment: 'nope' }).fileTreatment).toBe('linked');
        expect(DEFAULT_GRAPH_UI_STATE.fileTreatment).toBe('linked');
    });
});

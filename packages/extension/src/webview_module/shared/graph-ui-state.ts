/**
 * Workspace-persisted Ideas Summary graph Key + Controls state.
 * Stored in ExtensionContext.workspaceState; restored when the panel opens.
 */

export type GraphUiNodeTypeId = 'block' | 'oneliner' | 'ideaset' | 'focus' | 'external';

export type GraphUiTruncationBasis = 'path' | 'git-modified' | 'git-created';

/** Physics sliders exposed in the Controls panel (other physics knobs keep defaults). */
export interface GraphUiPhysicsPersisted {
    gravity: number;
    repulsion: number;
    linkStrength: number;
    linkDistance: number;
    damping: number;
}

export interface GraphUiPersistedState {
    showKey: boolean;
    showControls: boolean;
    hiddenNodeTypes: GraphUiNodeTypeId[];
    layoutId: string;
    useCompound: boolean;
    compoundBasisId: string;
    animatePhysics: boolean;
    maxNodes: number;
    truncationBasis: GraphUiTruncationBasis;
    physics: GraphUiPhysicsPersisted;
}

export const GRAPH_UI_WORKSPACE_STATE_KEY = 'reqlan.ideasSummary.graphUi';

export const DEFAULT_GRAPH_UI_PHYSICS: GraphUiPhysicsPersisted = {
    gravity: 0.002,
    repulsion: 20000,
    linkStrength: 0.015,
    linkDistance: 120,
    damping: 0.5
};

export const DEFAULT_GRAPH_UI_STATE: GraphUiPersistedState = {
    showKey: false,
    showControls: false,
    hiddenNodeTypes: [],
    layoutId: 'fcose',
    useCompound: false,
    compoundBasisId: 'folder-path',
    animatePhysics: false,
    maxNodes: 120,
    truncationBasis: 'path',
    physics: { ...DEFAULT_GRAPH_UI_PHYSICS }
};

const NODE_TYPE_IDS = new Set<GraphUiNodeTypeId>([
    'block',
    'oneliner',
    'ideaset',
    'focus',
    'external'
]);

const LAYOUT_IDS = new Set([
    'fcose',
    'cola',
    'breadthfirst',
    'circle',
    'concentric',
    'grid',
    'random'
]);

const COMPOUND_BASIS_IDS = new Set(['folder-path', 'parent-folder', 'tags']);

function finiteOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePhysics(raw: unknown): GraphUiPhysicsPersisted {
    const input = raw && typeof raw === 'object' ? (raw as Partial<GraphUiPhysicsPersisted>) : {};
    return {
        gravity: finiteOr(input.gravity, DEFAULT_GRAPH_UI_PHYSICS.gravity),
        repulsion: finiteOr(input.repulsion, DEFAULT_GRAPH_UI_PHYSICS.repulsion),
        linkStrength: finiteOr(input.linkStrength, DEFAULT_GRAPH_UI_PHYSICS.linkStrength),
        linkDistance: finiteOr(input.linkDistance, DEFAULT_GRAPH_UI_PHYSICS.linkDistance),
        damping: finiteOr(input.damping, DEFAULT_GRAPH_UI_PHYSICS.damping)
    };
}

/** Coerce unknown workspace / message payloads into a complete GraphUiPersistedState. */
export function normalizeGraphUiState(raw: unknown): GraphUiPersistedState {
    const input = raw && typeof raw === 'object' ? (raw as Partial<GraphUiPersistedState>) : {};
    const layoutId =
        typeof input.layoutId === 'string' && LAYOUT_IDS.has(input.layoutId)
            ? input.layoutId
            : DEFAULT_GRAPH_UI_STATE.layoutId;
    const compoundBasisId =
        typeof input.compoundBasisId === 'string' && COMPOUND_BASIS_IDS.has(input.compoundBasisId)
            ? input.compoundBasisId
            : DEFAULT_GRAPH_UI_STATE.compoundBasisId;
    const truncationBasis =
        input.truncationBasis === 'git-modified' || input.truncationBasis === 'git-created'
            ? input.truncationBasis
            : 'path';
    const hiddenNodeTypes = Array.isArray(input.hiddenNodeTypes)
        ? input.hiddenNodeTypes.filter((id): id is GraphUiNodeTypeId =>
            typeof id === 'string' && NODE_TYPE_IDS.has(id as GraphUiNodeTypeId)
        )
        : [];
    const maxNodes = Math.min(
        1000,
        Math.max(1, Math.round(finiteOr(input.maxNodes, DEFAULT_GRAPH_UI_STATE.maxNodes)))
    );

    return {
        showKey: Boolean(input.showKey),
        showControls: Boolean(input.showControls),
        hiddenNodeTypes,
        layoutId,
        useCompound: Boolean(input.useCompound),
        compoundBasisId,
        animatePhysics: Boolean(input.animatePhysics),
        maxNodes,
        truncationBasis,
        physics: normalizePhysics(input.physics)
    };
}

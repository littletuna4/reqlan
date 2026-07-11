/**
 * Cytoscape graph helpers for the Ideas Summary graph tab.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"]
 */
import type cytoscape from 'cytoscape';
import type { ElementDefinition, StylesheetStyle } from 'cytoscape';
import type { GraphEdgeView, GraphNodeView, GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
import { GRAPH_NODE_COLORS, graphNodeFill, resolveThemeColor } from './graph-theme.js';

export type CompoundBasis = (node: GraphNodeView) => readonly string[];

export interface GraphLayoutOption {
    id: string;
    label: string;
    supportsCompound: boolean;
}

export const GRAPH_LAYOUT_OPTIONS: GraphLayoutOption[] = [
    { id: 'fcose', label: 'Force-directed (fcose)', supportsCompound: true },
    { id: 'cola', label: 'Animate (cola)', supportsCompound: true },
    { id: 'breadthfirst', label: 'Breadthfirst', supportsCompound: true },
    { id: 'circle', label: 'Circle', supportsCompound: false },
    { id: 'concentric', label: 'Concentric', supportsCompound: false },
    { id: 'grid', label: 'Grid', supportsCompound: true },
    { id: 'random', label: 'Random', supportsCompound: false }
];

export const DEFAULT_LAYOUT_ID = 'fcose';

/** Layout id used to drive continuous ("live") physics regardless of the selected batch layout. */
export const PHYSICS_LAYOUT_ID = 'cola';

const FORCE_DIRECTED_LAYOUT_IDS = new Set(['fcose', 'cose', 'cola']);

export function isForceDirectedLayout(layoutId: string): boolean {
    return FORCE_DIRECTED_LAYOUT_IDS.has(layoutId);
}

/** Why a layout run was requested — drives animation, fit, and incremental behaviour. */
export type LayoutRunMode = 'initial' | 'relayout' | 'physics';

export interface LayoutFixedNode {
    nodeId: string;
    position: { x: number; y: number };
}

/** Reuse prior positions when possible, then seed remaining nodes on a circle. */
export function seedNodePositions(
    cy: cytoscape.Core,
    persistedPositions: ReadonlyMap<string, { x: number; y: number }> = new Map()
): void {
    const nodes = cy.nodes(':childless');
    const count = nodes.length;
    if (count === 0) {
        return;
    }

    const radius = Math.max(140, Math.sqrt(count) * 70);
    nodes.forEach((node, index) => {
        const persisted = persistedPositions.get(node.id());
        if (persisted) {
            node.position(persisted);
            return;
        }
        const angle = (2 * Math.PI * index) / count;
        node.position({
            x: radius * Math.cos(angle),
            y: radius * Math.sin(angle)
        });
    });
}

/** Group nodes by every folder segment in their relative path. */
export const folderPathCompoundBasis: CompoundBasis = node => {
    const normalized = node.path.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length <= 1) {
        return [];
    }
    segments.pop();
    return segments;
};

/** Group nodes under a single parent folder (immediate directory only). */
export const parentFolderCompoundBasis: CompoundBasis = node => {
    const segments = folderPathCompoundBasis(node);
    return segments.length > 0 ? [segments.join('/')] : [];
};

export interface BuildElementsOptions {
    useCompound: boolean;
    compoundBasis: CompoundBasis;
    centerId?: string;
}

function truncate(value: string, max = 28): string {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function compoundNodeId(path: string): string {
    return `compound:${path}`;
}

function buildCompoundElements(
    nodes: GraphNodeView[],
    compoundBasis: CompoundBasis
): { compounds: ElementDefinition[]; parentByNodeId: Map<string, string> } {
    const compounds = new Map<string, ElementDefinition>();
    const parentByNodeId = new Map<string, string>();

    for (const node of nodes) {
        if (node.isExternal) {
            continue;
        }

        const segments = compoundBasis(node);
        if (segments.length === 0) {
            continue;
        }

        let parentPath = '';
        let parentId: string | undefined;
        for (const segment of segments) {
            parentPath = parentPath ? `${parentPath}/${segment}` : segment;
            const id = compoundNodeId(parentPath);
            if (!compounds.has(id)) {
                compounds.set(id, {
                    data: {
                        id,
                        label: segment,
                        isCompound: true,
                        ...(parentId ? { parent: parentId } : {})
                    }
                });
            }
            parentId = id;
        }

        if (parentId) {
            parentByNodeId.set(node.id, parentId);
        }
    }

    return {
        compounds: [...compounds.values()],
        parentByNodeId
    };
}

export function buildCytoscapeElements(
    slice: GraphViewSlice,
    options: BuildElementsOptions
): ElementDefinition[] {
    const { useCompound, compoundBasis, centerId } = options;
    const nodeElements: ElementDefinition[] = [];
    const compoundElements = useCompound
        ? buildCompoundElements(slice.nodes, compoundBasis)
        : { compounds: [] as ElementDefinition[], parentByNodeId: new Map<string, string>() };

    for (const node of slice.nodes) {
        const label = node.status
            ? `${truncate(node.name)}\n${truncate(node.status, 18)}`
            : truncate(node.name);

        const compoundParentId = useCompound ? compoundElements.parentByNodeId.get(node.id) : undefined;
        nodeElements.push({
            data: {
                id: node.id,
                label,
                color: graphNodeFill(node, centerId),
                isExternal: Boolean(node.isExternal),
                isCenter: node.id === centerId,
                nodeKind: node.kind,
                ...(compoundParentId ? { parent: compoundParentId } : {})
            }
        });
    }

    const externalNodeIds = new Set(
        slice.nodes.filter(node => node.isExternal).map(node => node.id)
    );
    const edgeElements: ElementDefinition[] = slice.edges.map(edge => ({
        data: {
            id: edge.id,
            source: edge.sourceId,
            target: edge.targetId,
            isExternal: externalNodeIds.has(edge.targetId)
        }
    }));

    return [...compoundElements.compounds, ...nodeElements, ...edgeElements];
}

export function buildCytoscapeStylesheet(): StylesheetStyle[] {
    const foreground = resolveThemeColor('var(--vscode-foreground)', '#cccccc');
    const description = resolveThemeColor('var(--vscode-descriptionForeground)', '#999999');
    const editorBg = resolveThemeColor('var(--vscode-editor-background)', '#1e1e1e');
    const panelBorder = resolveThemeColor('var(--vscode-panel-border)', '#3c3c3c');
    const focusBorder = resolveThemeColor('var(--vscode-focusBorder)', '#007fd4');
    const linkActive = resolveThemeColor('var(--vscode-textLink-activeForeground)', '#3794ff');

    return [
        {
            selector: 'node',
            style: {
                label: 'data(label)',
                'text-wrap': 'wrap',
                'text-max-width': '120px',
                'font-size': '10px',
                'min-zoomed-font-size': 8,
                'text-valign': 'bottom',
                'text-halign': 'center',
                'text-margin-y': 6,
                color: foreground,
                'background-color': 'data(color)',
                width: 44,
                height: 44,
                'border-width': 2,
                'border-color': editorBg
            }
        },
        {
            selector: 'node[?isCompound]',
            style: {
                'background-opacity': 0.06,
                'background-color': GRAPH_NODE_COLORS.block,
                'border-width': 1,
                'border-style': 'dashed',
                'border-color': panelBorder,
                'text-valign': 'top',
                'text-halign': 'center',
                'font-size': '11px',
                'font-weight': 'bold',
                color: description,
                padding: '16px',
                shape: 'round-rectangle'
            }
        },
        {
            selector: 'node[?isCenter]',
            style: {
                'border-width': 3,
                'border-color': focusBorder
            }
        },
        {
            selector: 'node:selected',
            style: {
                'border-width': 3,
                'border-color': linkActive
            }
        },
        {
            selector: 'node[?isExternal]',
            style: {
                'background-opacity': 0.85,
                shape: 'round-rectangle'
            }
        },
        {
            selector: 'edge',
            style: {
                width: 1.5,
                'line-color': panelBorder,
                'target-arrow-shape': 'none',
                'curve-style': 'straight'
            }
        },
        {
            selector: 'edge[?isExternal]',
            style: {
                'line-style': 'dashed',
                'line-color': GRAPH_NODE_COLORS.external
            }
        }
    ];
}

/** Continuous force-directed physics config (cola, infinite) used while "live physics" is on. */
export function getPhysicsLayoutConfig(useCompound: boolean, nodeCount = 0): cytoscape.LayoutOptions {
    return getLayoutConfig(PHYSICS_LAYOUT_ID, useCompound, 'physics', nodeCount);
}

/** Seed positions for only the given (newly added) nodes, leaving existing nodes untouched. */
export function seedNewNodePositions(
    cy: cytoscape.Core,
    newNodeIds: readonly string[],
    persistedPositions: ReadonlyMap<string, { x: number; y: number }> = new Map()
): void {
    if (newNodeIds.length === 0) {
        return;
    }
    const radius = Math.max(140, Math.sqrt(cy.nodes(':childless').length) * 70);
    newNodeIds.forEach((id, index) => {
        const node = cy.getElementById(id);
        if (node.length === 0 || !node.isNode() || node.isParent()) {
            return;
        }
        const persisted = persistedPositions.get(id);
        if (persisted) {
            node.position(persisted);
            return;
        }
        const angle = (2 * Math.PI * index) / newNodeIds.length;
        node.position({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    });
}

export function getLayoutConfig(
    layoutId: string,
    useCompound: boolean,
    mode: LayoutRunMode,
    nodeCount = 0,
    fixedNodes: readonly LayoutFixedNode[] = []
): cytoscape.LayoutOptions {
    const isInitial = mode === 'initial';
    const isPhysics = mode === 'physics';

    const base = {
        name: layoutId,
        animate: !isPhysics,
        animationDuration: isPhysics ? 0 : 400,
        animationEasing: 'ease-out-cubic',
        fit: isInitial || mode === 'relayout',
        padding: 36
    };

    const cappedIterations = Math.min(80, 20 + nodeCount);
    const fixedNodeConstraint =
        fixedNodes.length > 0
            ? fixedNodes.map(node => ({ nodeId: node.nodeId, position: { ...node.position } }))
            : undefined;

    // Built as plain objects (cytoscape's layout typings are strict discriminated
    // unions that reject per-algorithm options), then cast once on return.
    const resolveConfig = (): Record<string, unknown> => {
    switch (layoutId) {
        case 'fcose':
            if (isPhysics) {
                // Incremental fcose: randomize must stay false; draft+randomize:false crashes in relocateComponent.
                return {
                    ...base,
                    animate: false,
                    animationDuration: 0,
                    fit: false,
                    quality: 'default',
                    randomize: false,
                    packComponents: false,
                    tile: false,
                    nodeRepulsion: 8000,
                    idealEdgeLength: 100,
                    numIter: 25,
                    ...(fixedNodeConstraint ? { fixedNodeConstraint } : {})
                };
            }
            if (isInitial) {
                return {
                    ...base,
                    animate: false,
                    animationDuration: 0,
                    fit: true,
                    quality: 'draft',
                    randomize: false,
                    packComponents: false,
                    tile: false,
                    nodeRepulsion: 8000,
                    idealEdgeLength: 100,
                    numIter: Math.min(40, cappedIterations),
                    ...(fixedNodeConstraint ? { fixedNodeConstraint } : {})
                };
            }
            return {
                ...base,
                animate: false,
                animationDuration: 0,
                animationEasing: 'ease-out-cubic',
                quality: 'draft',
                randomize: false,
                packComponents: false,
                nodeRepulsion: 8000,
                idealEdgeLength: 100,
                numIter: Math.min(48, cappedIterations),
                tile: false,
                ...(fixedNodeConstraint ? { fixedNodeConstraint } : {})
            };
        case 'cola':
            // cola is the only bundled layout with a true continuous simulation, so it
            // backs "live physics". infinite:true keeps it ticking inside cytoscape's own
            // animation loop (non-blocking); batch mode bounds it with maxSimulationTime.
            return {
                ...base,
                animate: true,
                randomize: false,
                avoidOverlap: !isPhysics,
                handleDisconnected: !isPhysics,
                nodeSpacing: 12,
                edgeLength: 110,
                ungrabifyWhileSimulating: false,
                centerGraph: !isPhysics,
                infinite: isPhysics,
                fit: isInitial || mode === 'relayout',
                maxSimulationTime: isPhysics ? 0 : Math.min(2500, 800 + nodeCount * 12)
            };
        case 'cose':
            return {
                ...base,
                nodeRepulsion: () => 8000,
                idealEdgeLength: () => 90,
                nestingFactor: useCompound ? 1.2 : 1,
                gravity: isPhysics ? 0.15 : 0.25,
                numIter: isPhysics ? 40 : cappedIterations,
                refresh: isPhysics ? 10 : 30
            };
        case 'breadthfirst':
            return {
                ...base,
                directed: true,
                spacingFactor: 1.2
            };
        case 'concentric':
            return {
                ...base,
                minNodeSpacing: 40,
                concentric: (node: cytoscape.NodeSingular) => (node.data('isCenter') ? 2 : 1),
                levelWidth: () => 2
            };
        case 'grid':
            return {
                ...base,
                condense: true
            };
        case 'circle':
        case 'random':
        default:
            return base;
    }
    };

    return resolveConfig() as unknown as cytoscape.LayoutOptions;
}
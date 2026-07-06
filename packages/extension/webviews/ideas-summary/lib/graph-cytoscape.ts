/**
 * Cytoscape graph helpers for the Ideas Summary graph tab.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"]
 */
import type cytoscape from 'cytoscape';
import type { ElementDefinition, StylesheetStyle } from 'cytoscape';
import type { GraphEdgeView, GraphNodeView, GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
import { GRAPH_NODE_COLORS, graphNodeFill } from './graph-theme.js';

export type CompoundBasis = (node: GraphNodeView) => readonly string[];

export interface GraphLayoutOption {
    id: string;
    label: string;
    supportsCompound: boolean;
}

export const GRAPH_LAYOUT_OPTIONS: GraphLayoutOption[] = [
    { id: 'fcose', label: 'Force-directed (fcose)', supportsCompound: true },
    { id: 'breadthfirst', label: 'Breadthfirst', supportsCompound: true },
    { id: 'circle', label: 'Circle', supportsCompound: false },
    { id: 'concentric', label: 'Concentric', supportsCompound: false },
    { id: 'grid', label: 'Grid', supportsCompound: true },
    { id: 'random', label: 'Random', supportsCompound: false }
];

export const DEFAULT_LAYOUT_ID = 'fcose';

const FORCE_DIRECTED_LAYOUT_IDS = new Set(['fcose', 'cose']);

export function isForceDirectedLayout(layoutId: string): boolean {
    return FORCE_DIRECTED_LAYOUT_IDS.has(layoutId);
}

/** Why a layout run was requested — drives animation, fit, and incremental behaviour. */
export type LayoutRunMode = 'initial' | 'relayout' | 'physics';

export interface LayoutFixedNode {
    nodeId: string;
    position: { x: number; y: number };
}

/** Spread nodes on a circle so the first animation frame is readable before fcose runs. */
export function seedNodePositions(cy: cytoscape.Core): void {
    const nodes = cy.nodes(':childless');
    const count = nodes.length;
    if (count === 0) {
        return;
    }

    const radius = Math.max(140, Math.sqrt(count) * 70);
    nodes.forEach((node, index) => {
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

    const edgeElements: ElementDefinition[] = slice.edges.map(edge => ({
        data: {
            id: edge.id,
            source: edge.sourceId,
            target: edge.targetId,
            isExternal: slice.nodes.some(node => node.id === edge.targetId && node.isExternal)
        }
    }));

    return [...compoundElements.compounds, ...nodeElements, ...edgeElements];
}

export function buildCytoscapeStylesheet(): StylesheetStyle[] {
    return [
        {
            selector: 'node',
            style: {
                label: 'data(label)',
                'text-wrap': 'wrap',
                'text-max-width': '120px',
                'font-size': '10px',
                'text-valign': 'bottom',
                'text-halign': 'center',
                'text-margin-y': 6,
                color: 'var(--vscode-foreground)',
                'background-color': 'data(color)',
                width: 44,
                height: 44,
                'border-width': 2,
                'border-color': 'var(--vscode-editor-background)'
            }
        },
        {
            selector: 'node[?isCompound]',
            style: {
                'background-opacity': 0.06,
                'background-color': 'var(--vscode-charts-blue, #3794ff)',
                'border-width': 1,
                'border-style': 'dashed',
                'border-color': 'var(--vscode-panel-border)',
                'text-valign': 'top',
                'text-halign': 'center',
                'font-size': '11px',
                'font-weight': 'bold',
                color: 'var(--vscode-descriptionForeground)',
                padding: '16px',
                shape: 'round-rectangle'
            }
        },
        {
            selector: 'node[?isCenter]',
            style: {
                'border-width': 3,
                'border-color': 'var(--vscode-focusBorder)'
            }
        },
        {
            selector: 'node:selected',
            style: {
                'border-width': 3,
                'border-color': 'var(--vscode-textLink-activeForeground)'
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
                'line-color': 'var(--vscode-panel-border)',
                'target-arrow-shape': 'none',
                'curve-style': 'bezier'
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

export function getLayoutConfig(
    layoutId: string,
    useCompound: boolean,
    mode: LayoutRunMode,
    nodeCount = 0,
    fixedNodes: readonly LayoutFixedNode[] = []
): cytoscape.LayoutOptions {
    const isInitial = mode === 'initial';
    const isPhysics = mode === 'physics';

    const base: cytoscape.LayoutOptions = {
        name: layoutId,
        animate: !isPhysics,
        animationDuration: isPhysics ? 0 : 400,
        animationEasing: 'ease-out-cubic',
        fit: isInitial || mode === 'relayout',
        padding: 36
    };

    const cappedIterations = Math.min(250, 40 + nodeCount * 4);
    const fixedNodeConstraint =
        fixedNodes.length > 0
            ? fixedNodes.map(node => ({ nodeId: node.nodeId, position: { ...node.position } }))
            : undefined;

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
                    numIter: 40,
                    ...(fixedNodeConstraint ? { fixedNodeConstraint } : {})
                };
            }
            return {
                ...base,
                animate: true,
                animationDuration: 400,
                animationEasing: 'ease-out-cubic',
                quality: 'default',
                randomize: isInitial,
                packComponents: isInitial,
                nodeRepulsion: 8000,
                idealEdgeLength: 100,
                numIter: cappedIterations,
                tile: true,
                ...(fixedNodeConstraint ? { fixedNodeConstraint } : {})
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
}
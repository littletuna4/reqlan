/**
 * Cytoscape graph helpers for the Ideas Summary graph tab.
 * per ["../../../../../reqlan rq/extension/library/graph.rq"] graph_cytoscape
 */
import type cytoscape from 'cytoscape';
import type { ElementDefinition, StylesheetStyle } from 'cytoscape';
import type { GraphEdgeView, GraphNodeView, GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
import {
    GROUP_HOVER_KEY,
    MEMBER_HOVER_KEY,
    MEMBER_SELECTED_KEY
} from './graph-cy-highlight.js';
import {
    GRAPH_EMPHASIS_BORDER,
    GRAPH_EMPHASIS_COLORS,
    GRAPH_NODE_COLORS,
    graphNodeFill,
    resolveThemeColor
} from './graph-theme.js';

/**
 * Hierarchical single-membership grouping: returns an ordered path of folder-like
 * segments. Each node lands in exactly one leaf compound (a strict tree).
 */
export type CompoundBasis = (node: GraphNodeView) => readonly string[];

/**
 * Flat multi-membership grouping: returns every group a node belongs to (0..n).
 * Unlike CompoundBasis this is NOT a tree — a node can be in several groups, which
 * is what drives shared-node container overlap (see graph-physics.ts).
 */
export type GroupBasis = (node: GraphNodeView) => readonly string[];

export interface GraphLayoutOption {
    id: string;
    label: string;
    supportsCompound: boolean;
}

export const GRAPH_LAYOUT_OPTIONS: GraphLayoutOption[] = [
    { id: 'fcose', label: 'Force-directed (fcose)', supportsCompound: true },
    { id: 'cola', label: 'Cola', supportsCompound: true },
    { id: 'breadthfirst', label: 'Breadthfirst', supportsCompound: true },
    { id: 'circle', label: 'Circle', supportsCompound: false },
    { id: 'concentric', label: 'Concentric', supportsCompound: false },
    { id: 'grid', label: 'Grid', supportsCompound: true },
    { id: 'random', label: 'Random', supportsCompound: false }
];

export const DEFAULT_LAYOUT_ID = 'fcose';

const FORCE_DIRECTED_LAYOUT_IDS = new Set(['fcose', 'cose', 'cola']);

export function isForceDirectedLayout(layoutId: string): boolean {
    return FORCE_DIRECTED_LAYOUT_IDS.has(layoutId);
}

/**
 * Why a layout run was requested — drives animation, fit, and incremental behaviour.
 * Live ("Animate") physics is not a layout run: it is a custom simulation in
 * ./graph-physics.ts that ticks node positions directly.
 */
export type LayoutRunMode = 'initial' | 'relayout';

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

/**
 * Multi-membership grouping by tag. A node with tags [a, b] belongs to both groups,
 * so containers `tag:a` and `tag:b` are allowed to overlap around it.
 */
export const tagGroupBasis: GroupBasis = node =>
    node.tags.map(tag => `tag:${tag}`);

/**
 * Grouping options offered in the "Group by" dropdown. Hierarchical options provide
 * a `compoundBasis` (single-membership tree); multi-membership options provide a
 * `groupBasis` (a node can belong to several groups, so containers can overlap).
 */
export interface GraphCompoundBasisOption {
    id: string;
    label: string;
    compoundBasis?: CompoundBasis;
    groupBasis?: GroupBasis;
}

export const GRAPH_COMPOUND_BASIS_OPTIONS: GraphCompoundBasisOption[] = [
    { id: 'folder-path', label: 'Folder path', compoundBasis: folderPathCompoundBasis },
    { id: 'parent-folder', label: 'Parent folder', compoundBasis: parentFolderCompoundBasis },
    { id: 'tags', label: 'Tags (overlapping)', groupBasis: tagGroupBasis }
];

export interface BuildElementsOptions {
    useCompound: boolean;
    compoundBasis: CompoundBasis;
    /**
     * When set, flat multi-membership grouping is used instead of the hierarchical
     * compoundBasis: the node's first group (sorted) becomes its rendered compound
     * parent, and every membership is written to data('groupIds').
     */
    groupBasis?: GroupBasis;
    centerId?: string;
}

function groupLabel(groupId: string): string {
    const colon = groupId.indexOf(':');
    return colon >= 0 ? groupId.slice(colon + 1) : groupId;
}

/**
 * Flat multi-membership grouping. Each node's memberships are sorted for
 * determinism; the first becomes the rendered compound parent (so the container
 * still draws as a rectangle), and a compound element is emitted for every group
 * that is some node's primary. All memberships are returned per node so physics
 * can bridge shared containers.
 */
function buildGroupElements(
    nodes: GraphNodeView[],
    groupBasis: GroupBasis
): {
    compounds: ElementDefinition[];
    parentByNodeId: Map<string, string>;
    groupIdsByNodeId: Map<string, string[]>;
} {
    const parentByNodeId = new Map<string, string>();
    const groupIdsByNodeId = new Map<string, string[]>();
    const primaryGroupIds = new Set<string>();

    for (const node of nodes) {
        if (node.isExternal) {
            continue;
        }
        const groups = [...new Set(groupBasis(node))].sort();
        if (groups.length === 0) {
            continue;
        }
        groupIdsByNodeId.set(node.id, groups);
        const primary = groups[0];
        parentByNodeId.set(node.id, primary);
        primaryGroupIds.add(primary);
    }

    const compounds: ElementDefinition[] = [...primaryGroupIds].sort().map(id => ({
        data: { id, label: groupLabel(id), isCompound: true }
    }));

    return { compounds, parentByNodeId, groupIdsByNodeId };
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
    const { useCompound, compoundBasis, groupBasis, centerId } = options;
    const nodeElements: ElementDefinition[] = [];

    // Two grouping modes share the same rendered-rectangle model: hierarchical
    // (folders, a strict tree) and flat multi-membership (tags, allows sharing).
    const useGroups = useCompound && Boolean(groupBasis);
    const groupElements = useGroups
        ? buildGroupElements(slice.nodes, groupBasis!)
        : undefined;
    const compoundElements = useCompound && !useGroups
        ? buildCompoundElements(slice.nodes, compoundBasis)
        : undefined;

    for (const node of slice.nodes) {
        const label = node.status
            ? `${truncate(node.name)}\n${truncate(node.status, 18)}`
            : truncate(node.name);

        const groupIds = groupElements?.groupIdsByNodeId.get(node.id);
        const parentId = groupElements
            ? groupElements.parentByNodeId.get(node.id)
            : compoundElements?.parentByNodeId.get(node.id);
        // groupIds drives physics separation/cohesion. In hierarchical mode a node
        // has exactly one membership (its immediate compound), so containers never
        // share and are always pushed apart; in group mode it can have several.
        const effectiveGroupIds = groupIds ?? (parentId && compoundElements ? [parentId] : undefined);

        nodeElements.push({
            data: {
                id: node.id,
                label,
                color: graphNodeFill(node, centerId),
                isExternal: Boolean(node.isExternal),
                isCenter: node.id === centerId,
                nodeKind: node.kind,
                ...(parentId ? { parent: parentId } : {}),
                ...(effectiveGroupIds && effectiveGroupIds.length > 0 ? { groupIds: effectiveGroupIds } : {})
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

    const compounds = groupElements?.compounds ?? compoundElements?.compounds ?? [];
    return [...compounds, ...nodeElements, ...edgeElements];
}

interface ThemeBorderColors {
    editorBg: string;
    focusBorder: string;
    linkActive: string;
    panelBorder: string;
    memberHover: string;
    memberSelected: string;
}

/** Childless idea nodes: compound group emphasis beats direct selection/focus. */
function childlessBorderWidth(node: cytoscape.NodeSingular): number {
    if (node.data(MEMBER_SELECTED_KEY) || node.data(MEMBER_HOVER_KEY)) {
        return GRAPH_EMPHASIS_BORDER.member;
    }
    if (node.selected() || node.data('isCenter')) {
        return GRAPH_EMPHASIS_BORDER.selected;
    }
    return 2;
}

function childlessBorderColor(node: cytoscape.NodeSingular, colors: ThemeBorderColors): string {
    // Green group-emphasis rings sit outside the node-kind palette so they stay
    // visible on blue block/focus fills (blue-on-blue was unreadable).
    if (node.data(MEMBER_SELECTED_KEY)) {
        return colors.memberSelected;
    }
    if (node.data(MEMBER_HOVER_KEY)) {
        return colors.memberHover;
    }
    if (node.selected()) {
        return colors.linkActive;
    }
    if (node.data('isCenter')) {
        return colors.focusBorder;
    }
    return colors.editorBg;
}

function compoundBorderWidth(node: cytoscape.NodeSingular): number {
    if (node.selected()) {
        return 3;
    }
    if (node.data(GROUP_HOVER_KEY)) {
        return 2;
    }
    return 1;
}

function compoundBorderColor(node: cytoscape.NodeSingular, colors: ThemeBorderColors): string {
    if (node.selected()) {
        return colors.memberSelected;
    }
    if (node.data(GROUP_HOVER_KEY)) {
        return colors.memberHover;
    }
    return colors.panelBorder;
}

function compoundBackgroundOpacity(node: cytoscape.NodeSingular): number {
    if (node.selected()) {
        return 0.12;
    }
    if (node.data(GROUP_HOVER_KEY)) {
        return 0.1;
    }
    return 0.06;
}

export function buildCytoscapeStylesheet(): StylesheetStyle[] {
    const foreground = resolveThemeColor('var(--vscode-foreground)', '#cccccc');
    const description = resolveThemeColor('var(--vscode-descriptionForeground)', '#999999');
    const editorBg = resolveThemeColor('var(--vscode-editor-background)', '#1e1e1e');
    const panelBorder = resolveThemeColor('var(--vscode-panel-border)', '#3c3c3c');
    const focusBorder = resolveThemeColor('var(--vscode-focusBorder)', '#007fd4');
    const linkActive = resolveThemeColor('var(--vscode-textLink-activeForeground)', '#3794ff');
    const memberHover = resolveThemeColor(GRAPH_EMPHASIS_COLORS.hover.css, GRAPH_EMPHASIS_COLORS.hover.fallback);
    const memberSelected = resolveThemeColor(GRAPH_EMPHASIS_COLORS.selected.css, GRAPH_EMPHASIS_COLORS.selected.fallback);
    const borderColors: ThemeBorderColors = {
        editorBg,
        focusBorder,
        linkActive,
        panelBorder,
        memberHover,
        memberSelected
    };

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
                'background-opacity': (node: cytoscape.NodeSingular) => compoundBackgroundOpacity(node),
                'background-color': GRAPH_NODE_COLORS.block,
                'border-width': (node: cytoscape.NodeSingular) => compoundBorderWidth(node),
                'border-style': 'dashed',
                'border-color': (node: cytoscape.NodeSingular) => compoundBorderColor(node, borderColors),
                'text-valign': 'top',
                'text-halign': 'center',
                'font-size': '11px',
                'font-weight': 'bold',
                color: description,
                padding: '16px',
                shape: 'round-rectangle'
            }
        },
        // Style mappers (not boolean selectors) so emphasis flags applied at runtime
        // reliably repaint in the VS Code webview canvas renderer.
        {
            selector: 'node:childless',
            style: {
                'border-width': (node: cytoscape.NodeSingular) => childlessBorderWidth(node),
                'border-color': (node: cytoscape.NodeSingular) => childlessBorderColor(node, borderColors)
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
    fixedNodes: readonly LayoutFixedNode[] = [],
    /** When true, batch layout only rough-places nodes; Animate physics continues afterward. */
    animatePhysicsFollows = false
): cytoscape.LayoutOptions {
    const isInitial = mode === 'initial';

    const base = {
        name: layoutId,
        animate: true,
        animationDuration: 400,
        animationEasing: 'ease-out-cubic',
        fit: true,
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
                    numIter: Math.min(animatePhysicsFollows ? 22 : 40, cappedIterations),
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
                numIter: Math.min(animatePhysicsFollows ? 28 : 48, cappedIterations),
                tile: false,
                ...(fixedNodeConstraint ? { fixedNodeConstraint } : {})
            };
        case 'cola':
            // Batch cola: leaf overlap via avoidOverlap; compound boxes are separated in
            // graph-groups post-pass. When Animate is on, keep cola short (~0.8 s) so the
            // custom physics sim (not cola) drives long convergence — cola fully settling
            // here makes Animate appear to "switch off" after a second or two.
            return {
                ...base,
                animate: true,
                randomize: false,
                avoidOverlap: true,
                handleDisconnected: !useCompound,
                nodeSpacing: useCompound ? 18 : 12,
                edgeLength: useCompound ? 120 : 110,
                ungrabifyWhileSimulating: false,
                centerGraph: !animatePhysicsFollows,
                infinite: false,
                maxSimulationTime: animatePhysicsFollows
                    ? 800
                    : useCompound
                      ? Math.min(4000, 1200 + nodeCount * 16)
                      : Math.min(2500, 800 + nodeCount * 12)
            };
        case 'cose':
            return {
                ...base,
                nodeRepulsion: () => 8000,
                idealEdgeLength: () => 90,
                nestingFactor: useCompound ? 1.2 : 1,
                gravity: 0.25,
                numIter: cappedIterations,
                refresh: 30
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
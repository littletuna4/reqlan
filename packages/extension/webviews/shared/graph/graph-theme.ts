/**
 * Graph node and edge styling shared by the canvas and legend.
 * per ["../../../../../reqlan rq/extension/library/graph.rq"] graph_cytoscape
 *
 * Cytoscape (especially WebGL) cannot parse CSS `var()` — node fills and stylesheet
 * colours must be concrete hex/rgb values. HTML legend swatches may still use vars.
 */
import type { GraphNodeView } from '../../../src/webview_module/shared/messages.js';

/** Concrete colours for cytoscape (hex). Keep in sync with VS Code chart token fallbacks. */
export const GRAPH_NODE_COLORS = {
    block: '#3794ff',
    oneliner: '#b180d7',
    ideaset: '#d18616',
    focus: '#3794ff',
    external: '#cca700'
} as const;

/** Border widths (px) for canvas + legend — keep in sync. */
export const GRAPH_EMPHASIS_BORDER = {
    /** Bright border on group members when the container is hovered. */
    member: 4,
    /** Border on directly selected or focused idea nodes. */
    selected: 3
} as const;

/**
 * Group-emphasis border colours. Green is deliberately outside the node-kind
 * palette (blue/purple/orange/yellow) so the highlight ring stays legible on any
 * node fill — a blue ring on the blue block/focus nodes was invisible.
 * CSS var form is for the legend; the `.fallback` hex is for cytoscape.
 */
export const GRAPH_EMPHASIS_COLORS = {
    hover: { css: 'var(--vscode-charts-green, #89d185)', fallback: '#89d185' },
    selected: { css: 'var(--vscode-testing-iconPassed, #3fb950)', fallback: '#3fb950' }
} as const;

/** CSS vars for HTML legend only (browser resolves these). */
export const GRAPH_LEGEND_CSS_COLORS = {
    block: 'var(--vscode-charts-blue, #3794ff)',
    oneliner: 'var(--vscode-charts-purple, #b180d7)',
    ideaset: 'var(--vscode-charts-orange, #d18616)',
    focus: 'var(--vscode-textLink-foreground, #3794ff)',
    external: 'var(--vscode-editorWarning-foreground, #cca700)',
    groupHover: GRAPH_EMPHASIS_COLORS.hover.css,
    groupSelected: GRAPH_EMPHASIS_COLORS.selected.css
} as const;

export interface GraphLegendNodeItem {
    kind: 'node';
    label: string;
    color: string;
}

export interface GraphLegendEdgeItem {
    kind: 'edge';
    label: string;
    variant: 'solid' | 'dashed';
}

export interface GraphLegendCompoundItem {
    kind: 'compound';
    label: string;
}

export interface GraphLegendGroupEmphasisItem {
    kind: 'group-emphasis';
    label: string;
    variant: 'hover' | 'selected';
}

export type GraphLegendItem =
    | GraphLegendNodeItem
    | GraphLegendEdgeItem
    | GraphLegendCompoundItem
    | GraphLegendGroupEmphasisItem;

export const GRAPH_LEGEND_ITEMS: GraphLegendItem[] = [
    { kind: 'node', label: 'Block idea', color: GRAPH_LEGEND_CSS_COLORS.block },
    { kind: 'node', label: 'One-liner', color: GRAPH_LEGEND_CSS_COLORS.oneliner },
    { kind: 'node', label: 'Ideaset', color: GRAPH_LEGEND_CSS_COLORS.ideaset },
    { kind: 'node', label: 'Focused idea', color: GRAPH_LEGEND_CSS_COLORS.focus },
    { kind: 'node', label: 'External file', color: GRAPH_LEGEND_CSS_COLORS.external },
    { kind: 'compound', label: 'Folder group (container)' },
    { kind: 'group-emphasis', label: 'Group hover — member border', variant: 'hover' },
    { kind: 'group-emphasis', label: 'Group selected — member border', variant: 'selected' },
    { kind: 'edge', label: 'Reference', variant: 'solid' },
    { kind: 'edge', label: 'External file reference', variant: 'dashed' }
];

export function graphNodeFill(node: GraphNodeView, centerId?: string): string {
    if (node.isExternal) {
        return GRAPH_NODE_COLORS.external;
    }
    if (node.id === centerId) {
        return GRAPH_NODE_COLORS.focus;
    }
    switch (node.kind) {
        case 'oneliner':
            return GRAPH_NODE_COLORS.oneliner;
        case 'ideaset':
            return GRAPH_NODE_COLORS.ideaset;
        default:
            return GRAPH_NODE_COLORS.block;
    }
}

/** Mirror analytical hotspot helpers — keep webview free of analytical runtime deps. */
export function hotspotBorderWidth(band?: 'low' | 'medium' | 'high'): number {
    switch (band) {
        case 'high':
            return 5;
        case 'medium':
            return 3;
        case 'low':
            return 2;
        default:
            return 2;
    }
}

export function hotspotBorderColor(band?: 'low' | 'medium' | 'high'): string {
    switch (band) {
        case 'high':
            return '#f14c4c';
        case 'medium':
            return '#cca700';
        case 'low':
            return '#89d185';
        default:
            return '#3c3c3c';
    }
}

export function impactOpacityForHopDistance(distance: number | undefined): number {
    if (distance === undefined) {
        return 0.2;
    }
    if (distance <= 0) {
        return 1;
    }
    if (distance === 1) {
        return 0.75;
    }
    if (distance === 2) {
        return 0.45;
    }
    return 0.2;
}

export function hopDistancesFromCenter(
    centerId: string,
    edges: { sourceId: string; targetId: string }[]
): Map<string, number> {
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
        if (!adjacency.has(edge.sourceId)) {
            adjacency.set(edge.sourceId, new Set());
        }
        if (!adjacency.has(edge.targetId)) {
            adjacency.set(edge.targetId, new Set());
        }
        adjacency.get(edge.sourceId)!.add(edge.targetId);
        adjacency.get(edge.targetId)!.add(edge.sourceId);
    }
    const distances = new Map<string, number>();
    const queue: string[] = [centerId];
    distances.set(centerId, 0);
    while (queue.length > 0) {
        const current = queue.shift()!;
        const nextDist = (distances.get(current) ?? 0) + 1;
        for (const neighbour of adjacency.get(current) ?? []) {
            if (!distances.has(neighbour)) {
                distances.set(neighbour, nextDist);
                queue.push(neighbour);
            }
        }
    }
    return distances;
}

/** Resolve a CSS color (including var()) against the document for cytoscape stylesheets. */
export function resolveThemeColor(cssColor: string, fallback: string): string {
    if (typeof document === 'undefined') {
        return fallback;
    }
    if (!cssColor.includes('var(')) {
        return cssColor;
    }
    const probe = document.createElement('span');
    probe.style.color = cssColor;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved && resolved !== 'rgba(0, 0, 0, 0)' ? resolved : fallback;
}

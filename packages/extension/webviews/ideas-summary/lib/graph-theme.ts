/**
 * Graph node and edge styling shared by the canvas and legend.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"]
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

/** CSS vars for HTML legend only (browser resolves these). */
export const GRAPH_LEGEND_CSS_COLORS = {
    block: 'var(--vscode-charts-blue, #3794ff)',
    oneliner: 'var(--vscode-charts-purple, #b180d7)',
    ideaset: 'var(--vscode-charts-orange, #d18616)',
    focus: 'var(--vscode-textLink-foreground, #3794ff)',
    external: 'var(--vscode-editorWarning-foreground, #cca700)'
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

export type GraphLegendItem = GraphLegendNodeItem | GraphLegendEdgeItem;

export const GRAPH_LEGEND_ITEMS: GraphLegendItem[] = [
    { kind: 'node', label: 'Block idea', color: GRAPH_LEGEND_CSS_COLORS.block },
    { kind: 'node', label: 'One-liner', color: GRAPH_LEGEND_CSS_COLORS.oneliner },
    { kind: 'node', label: 'Ideaset', color: GRAPH_LEGEND_CSS_COLORS.ideaset },
    { kind: 'node', label: 'Focused idea', color: GRAPH_LEGEND_CSS_COLORS.focus },
    { kind: 'node', label: 'External file', color: GRAPH_LEGEND_CSS_COLORS.external },
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

/**
 * Graph node and edge styling shared by the canvas and legend.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"]
 */
import type { GraphNodeView } from '../../../src/webview_module/shared/messages.js';

export const GRAPH_NODE_COLORS = {
    block: 'var(--vscode-charts-blue, #3794ff)',
    oneliner: 'var(--vscode-charts-purple, #b180d7)',
    ideaset: 'var(--vscode-charts-orange, #d18616)',
    focus: 'var(--vscode-textLink-foreground)',
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
    { kind: 'node', label: 'Block idea', color: GRAPH_NODE_COLORS.block },
    { kind: 'node', label: 'One-liner', color: GRAPH_NODE_COLORS.oneliner },
    { kind: 'node', label: 'Ideaset', color: GRAPH_NODE_COLORS.ideaset },
    { kind: 'node', label: 'Focused idea', color: GRAPH_NODE_COLORS.focus },
    { kind: 'node', label: 'External file', color: GRAPH_NODE_COLORS.external },
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

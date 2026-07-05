/**
 * Force-directed graph physics via d3-force.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"]
 */
import {
    forceCenter,
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    type Simulation,
    type SimulationLinkDatum,
    type SimulationNodeDatum
} from 'd3-force';

export interface SimNode extends SimulationNodeDatum {
    id: string;
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
    id: string;
}

export interface GraphSimulationOptions {
    width: number;
    height: number;
    centerId?: string;
}

export function createGraphSimulation(
    nodes: SimNode[],
    links: SimLink[],
    options: GraphSimulationOptions
): Simulation<SimNode, SimLink> {
    const { width, height, centerId } = options;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.28;

    for (const [index, node] of nodes.entries()) {
        const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
        node.x = cx + Math.cos(angle) * radius;
        node.y = cy + Math.sin(angle) * radius;
        if (node.id === centerId) {
            node.fx = cx;
            node.fy = cy;
        }
    }

    return forceSimulation(nodes)
        .force(
            'link',
            forceLink<SimNode, SimLink>()
                .id(node => node.id)
                .links(links)
                .distance(120)
                .strength(0.85)
        )
        .force('charge', forceManyBody().strength(-420).distanceMax(420))
        .force('center', forceCenter(cx, cy).strength(0.06))
        .force('collide', forceCollide<SimNode>(30).strength(0.9))
        .alpha(1)
        .alphaDecay(0.022)
        .velocityDecay(0.35);
}

export function buildSimulationLinks(
    edges: Array<{ id: string; sourceId: string; targetId: string }>
): SimLink[] {
    return edges.map(edge => ({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId
    }));
}

export function buildSimulationNodes(ids: string[]): SimNode[] {
    return ids.map(id => ({ id }));
}

export function pinNode(node: SimNode, x: number, y: number): void {
    node.fx = x;
    node.fy = y;
}

export function releaseNode(node: SimNode, keepFixed = false): void {
    if (keepFixed) {
        node.fx = node.x;
        node.fy = node.y;
        return;
    }
    node.fx = null;
    node.fy = null;
}

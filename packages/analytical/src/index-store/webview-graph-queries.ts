import type { EdgeRecord, IdeaSummary } from '../core/types.js';
import { attributeJsonPath } from './webview-table-queries.js';
import type { SqliteIndexStore } from './sqlite-store.js';

export const GRAPH_MAX_NODES = 120;

export const CONTEXT_MIN_HOP_DEPTH = 1;
export const CONTEXT_MAX_HOP_DEPTH = 4;

export function clampGraphHopDepth(depth: number): number {
    return Math.min(CONTEXT_MAX_HOP_DEPTH, Math.max(CONTEXT_MIN_HOP_DEPTH, Math.round(depth)));
}

export interface GraphViewQuery {
    centerId?: string;
    search?: string;
    pathFilter?: string;
    statusFilter?: string;
    tagFilter?: string;
    /** @deprecated Prefer hopDepth — true maps to depth 2 when hopDepth is omitted */
    includeIndirect: boolean;
    /** Neighbourhood hop depth from center (1 = direct edges only). */
    hopDepth?: number;
    maxNodes?: number;
}

export interface GraphNodeView {
    id: string;
    name: string;
    kind: string;
    fileUri: string;
    lineStart: number;
    status?: string;
    tags: string[];
    isExternal?: boolean;
    hotspotBand?: 'low' | 'medium' | 'high';
}

export interface GraphEdgeView {
    id: string;
    sourceId: string;
    targetId: string;
    kind: string;
    label?: string;
}

export interface GraphViewSlice {
    query: GraphViewQuery;
    centerId?: string;
    depth: number;
    truncated: boolean;
    totalMatching?: number;
    nodes: GraphNodeView[];
    edges: GraphEdgeView[];
}

export function buildGraphFilterWhereClause(query: GraphViewQuery): { sql: string; params: unknown[] } {
    const clauses = ["i.kind != 'ideaset'"];
    const params: unknown[] = [];

    if (query.search?.trim()) {
        const pattern = `%${query.search.trim()}%`;
        clauses.push('(i.name LIKE ? OR i.summary LIKE ? OR i.file_uri LIKE ?)');
        params.push(pattern, pattern, pattern);
    }

    if (query.pathFilter?.trim()) {
        clauses.push('i.file_uri LIKE ?');
        params.push(`%${query.pathFilter.trim()}%`);
    }

    if (query.statusFilter?.trim()) {
        const path = attributeJsonPath('status');
        clauses.push(`json_extract(i.attributes_json, ?) = ?`);
        params.push(path, query.statusFilter.trim());
    }

    if (query.tagFilter?.trim()) {
        const tag = query.tagFilter.trim();
        const path = attributeJsonPath('tags');
        clauses.push(`(
            json_extract(i.attributes_json, ?) LIKE ?
            OR EXISTS (
                SELECT 1 FROM json_each(json_extract(i.attributes_json, ?))
                WHERE value = ?
            )
        )`);
        params.push(path, `%${tag}%`, path, tag);
    }

    return { sql: clauses.join(' AND '), params };
}

export function toGraphNodeView(idea: IdeaSummary): GraphNodeView {
    return {
        id: idea.id,
        name: idea.name,
        kind: idea.kind,
        fileUri: idea.fileUri,
        lineStart: idea.lineStart,
        status: idea.status,
        tags: idea.tags
    };
}

function externalNodeId(targetFile: string): string {
    return `file:${targetFile}`;
}

function toGraphEdgeView(edge: EdgeRecord): GraphEdgeView | undefined {
    const targetId = edge.targetId ?? (edge.targetFile ? externalNodeId(edge.targetFile) : undefined);
    if (!targetId) {
        return undefined;
    }
    return {
        id: edge.id,
        sourceId: edge.sourceId,
        targetId,
        kind: edge.kind,
        label: edge.label ?? edge.targetFile
    };
}

function externalGraphNode(targetFile: string, label?: string): GraphNodeView {
    return {
        id: externalNodeId(targetFile),
        name: label ?? targetFile,
        kind: 'file',
        fileUri: targetFile,
        lineStart: 0,
        tags: [],
        isExternal: true
    };
}

export async function buildGraphViewSlice(
    store: SqliteIndexStore,
    query: GraphViewQuery
): Promise<GraphViewSlice> {
    const maxNodes = Math.min(Math.max(1, query.maxNodes ?? GRAPH_MAX_NODES), 200);
    const depth = clampGraphHopDepth(query.hopDepth ?? (query.includeIndirect ? 2 : 1));

    if (query.centerId) {
        return expandFromCenter(store, query, query.centerId, depth, maxNodes);
    }

    const { candidates, totalMatching } = await store.listIdeasForGraphQuery(query, maxNodes + 1);
    if (candidates.length === 0) {
        return {
            query,
            depth,
            truncated: false,
            totalMatching: 0,
            nodes: [],
            edges: []
        };
    }

    const truncated = candidates.length > maxNodes;
    const seedNodes = truncated ? candidates.slice(0, maxNodes) : candidates;
    return collectSliceFromSeeds(store, query, seedNodes, depth, maxNodes, truncated, totalMatching);
}

async function expandFromCenter(
    store: SqliteIndexStore,
    query: GraphViewQuery,
    centerId: string,
    depth: number,
    maxNodes: number
): Promise<GraphViewSlice> {
    const center = await store.getIdea(centerId);
    if (!center) {
        return {
            query,
            centerId,
            depth,
            truncated: false,
            nodes: [],
            edges: []
        };
    }

    const nodes = new Map<string, IdeaSummary>([[center.id, center]]);
    const edges = new Map<string, EdgeRecord>();
    const visited = new Set<string>([centerId]);
    let truncated = false;

    // Breadth-first expansion, one batched edge/idea round trip per level rather
    // than a query per visited node (avoids the N+1 fan-out that froze the tab).
    let frontier: string[] = [centerId];
    for (let level = 0; level < depth && frontier.length > 0; level += 1) {
        const frontierEdges = await store.getEdgesForNodes(frontier);
        const neighborIds = new Set<string>();
        for (const edge of frontierEdges) {
            edges.set(edge.id, edge);
            for (const endpoint of [edge.sourceId, edge.targetId]) {
                if (endpoint && !visited.has(endpoint)) {
                    neighborIds.add(endpoint);
                }
            }
        }

        const idsToFetch = [...neighborIds];
        const neighborIdeas = await store.getIdeasByIds(idsToFetch);
        const ideaById = new Map(neighborIdeas.map(idea => [idea.id, idea]));
        const nextFrontier: string[] = [];
        for (const id of idsToFetch) {
            visited.add(id);
            const idea = ideaById.get(id);
            if (!idea) {
                continue;
            }
            if (nodes.size >= maxNodes) {
                truncated = true;
                continue;
            }
            nodes.set(idea.id, idea);
            nextFrontier.push(id);
        }
        frontier = nextFrontier;
    }

    // Capture edges incident to the outermost ring so inter-node links are not dropped.
    if (frontier.length > 0) {
        for (const edge of await store.getEdgesForNodes(frontier)) {
            edges.set(edge.id, edge);
        }
    }

    const nodeIds = new Set(nodes.keys());
    const visibleEdges = filterVisibleEdges(edges, nodeIds);
    return finalizeSlice(query, centerId, depth, truncated, undefined, nodes, visibleEdges);
}

/** Keep edges whose endpoints are both present (or whose target is an external file). */
function filterVisibleEdges(
    edges: Map<string, EdgeRecord>,
    nodeIds: Set<string>
): Map<string, EdgeRecord> {
    const visible = new Map<string, EdgeRecord>();
    for (const edge of edges.values()) {
        const connectsVisible =
            nodeIds.has(edge.sourceId) &&
            (edge.targetId ? nodeIds.has(edge.targetId) : Boolean(edge.targetFile));
        if (connectsVisible) {
            visible.set(edge.id, edge);
        }
    }
    return visible;
}

async function collectSliceFromSeeds(
    store: SqliteIndexStore,
    query: GraphViewQuery,
    seedNodes: IdeaSummary[],
    depth: number,
    maxNodes: number,
    truncated: boolean,
    totalMatching: number
): Promise<GraphViewSlice> {
    const nodes = new Map<string, IdeaSummary>(seedNodes.map(node => [node.id, node]));

    // One batched query for every edge incident to a seed, replacing the
    // per-seed inbound/outbound fan-out.
    const seedEdges = await store.getEdgesForNodes(seedNodes.map(node => node.id));
    const edges = new Map<string, EdgeRecord>();
    for (const edge of seedEdges) {
        edges.set(edge.id, edge);
    }

    if (depth > 1) {
        const neighborIds = new Set<string>();
        for (const edge of seedEdges) {
            for (const endpoint of [edge.sourceId, edge.targetId]) {
                if (endpoint && !nodes.has(endpoint)) {
                    neighborIds.add(endpoint);
                }
            }
        }

        const idsToFetch = [...neighborIds];
        const neighborIdeas = await store.getIdeasByIds(idsToFetch);
        const ideaById = new Map(neighborIdeas.map(idea => [idea.id, idea]));
        for (const id of idsToFetch) {
            const idea = ideaById.get(id);
            if (!idea) {
                continue;
            }
            if (nodes.size < maxNodes) {
                nodes.set(idea.id, idea);
            } else {
                truncated = true;
            }
        }
    }

    const nodeIds = new Set(nodes.keys());
    const visibleEdges = filterVisibleEdges(edges, nodeIds);

    return finalizeSlice(query, undefined, depth, truncated, totalMatching, nodes, visibleEdges);
}

function finalizeSlice(
    query: GraphViewQuery,
    centerId: string | undefined,
    depth: number,
    truncated: boolean,
    totalMatching: number | undefined,
    nodes: Map<string, IdeaSummary>,
    edges: Map<string, EdgeRecord>
): GraphViewSlice {
    const graphNodes = new Map<string, GraphNodeView>();
    for (const idea of nodes.values()) {
        graphNodes.set(idea.id, toGraphNodeView(idea));
    }

    const graphEdges: GraphEdgeView[] = [];
    for (const edge of edges.values()) {
        if (!edge.targetId && edge.targetFile) {
            const externalId = externalNodeId(edge.targetFile);
            if (!graphNodes.has(externalId)) {
                graphNodes.set(externalId, externalGraphNode(edge.targetFile, edge.label));
            }
        }
        const view = toGraphEdgeView(edge);
        if (view) {
            graphEdges.push(view);
        }
    }

    return {
        query,
        centerId,
        depth,
        truncated,
        totalMatching,
        nodes: [...graphNodes.values()],
        edges: graphEdges
    };
}

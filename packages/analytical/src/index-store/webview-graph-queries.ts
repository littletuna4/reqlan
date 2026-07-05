import type { EdgeRecord, IdeaSummary } from '../core/types.js';
import { attributeJsonPath } from './webview-table-queries.js';
import type { SqliteIndexStore } from './sqlite-store.js';

export const GRAPH_MAX_NODES = 120;

export interface GraphViewQuery {
    centerId?: string;
    search?: string;
    pathFilter?: string;
    statusFilter?: string;
    tagFilter?: string;
    includeIndirect: boolean;
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
    const depth = query.includeIndirect ? 2 : 1;

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

    const nodes = new Map<string, IdeaSummary>();
    const edges = new Map<string, EdgeRecord>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; remaining: number }> = [{ id: centerId, remaining: depth }];
    let truncated = false;

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.id)) {
            continue;
        }
        visited.add(current.id);

        const idea = await store.getIdea(current.id);
        if (idea) {
            if (nodes.size >= maxNodes && !nodes.has(idea.id)) {
                truncated = true;
                continue;
            }
            nodes.set(idea.id, idea);
        }

        const outbound = await store.getEdgesFrom(current.id);
        const inbound = await store.getEdgesTo(current.id);
        for (const edge of [...outbound, ...inbound]) {
            edges.set(edge.id, edge);
            if (current.remaining > 0) {
                const nextId = edge.sourceId === current.id ? edge.targetId : edge.sourceId;
                if (nextId) {
                    queue.push({ id: nextId, remaining: current.remaining - 1 });
                }
            }
        }
    }

    return finalizeSlice(query, centerId, depth, truncated, undefined, nodes, edges);
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
    const edges = new Map<string, EdgeRecord>();

    for (const seed of seedNodes) {
        const outbound = await store.getEdgesFrom(seed.id);
        const inbound = await store.getEdgesTo(seed.id);
        for (const edge of [...outbound, ...inbound]) {
            edges.set(edge.id, edge);
            if (depth > 1 && edge.targetId && !nodes.has(edge.targetId)) {
                if (nodes.size < maxNodes) {
                    const neighbor = await store.getIdea(edge.targetId);
                    if (neighbor) {
                        nodes.set(neighbor.id, neighbor);
                    }
                } else {
                    truncated = true;
                }
            }
            if (depth > 1 && edge.sourceId && !nodes.has(edge.sourceId)) {
                if (nodes.size < maxNodes) {
                    const neighbor = await store.getIdea(edge.sourceId);
                    if (neighbor) {
                        nodes.set(neighbor.id, neighbor);
                    }
                } else {
                    truncated = true;
                }
            }
        }
    }

    const nodeIds = new Set(nodes.keys());
    const visibleEdges = new Map<string, EdgeRecord>();
    for (const edge of edges.values()) {
        const connectsVisible =
            nodeIds.has(edge.sourceId) &&
            (edge.targetId ? nodeIds.has(edge.targetId) : Boolean(edge.targetFile));
        if (connectsVisible) {
            visibleEdges.set(edge.id, edge);
        }
    }

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

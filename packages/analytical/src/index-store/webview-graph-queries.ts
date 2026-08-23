/**
 * Graph slice queries for Ideas Summary and HTML export cartographic maps.
 * rq:["../../../../reqlan rq/ontology.rq".cartographic_map]
 * rq:["../../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".graphical_graph]
 */
import type { EdgeRecord, IdeaSummary } from '../core/types.js';
import { FILTER_EMPTY, FILTER_NOT_PRESENT } from '../core/filter-specials.js';
import { resolveReferencedFilePath } from '../core/file-reference-resolve.js';
import { attributeJsonPath } from './webview-table-queries.js';
import type { SqliteIndexStore } from './sqlite-store.js';

export const GRAPH_MAX_NODES = 120;
/** Hard ceiling for maxNodes — raise this constant to lift the user-facing cap. */
export const GRAPH_NODES_HARD_CAP = 1000;

export const CONTEXT_MIN_HOP_DEPTH = 1;
export const CONTEXT_MAX_HOP_DEPTH = 4;

export type GraphTruncationBasis = 'path' | 'git-modified' | 'git-created';

export const GRAPH_TRUNCATION_BASIS_OPTIONS: { id: GraphTruncationBasis; label: string }[] = [
    { id: 'path', label: 'Path' },
    { id: 'git-modified', label: 'Last modified' },
    { id: 'git-created', label: 'Last created' }
];

export function clampGraphHopDepth(depth: number): number {
    return Math.min(CONTEXT_MAX_HOP_DEPTH, Math.max(CONTEXT_MIN_HOP_DEPTH, Math.round(depth)));
}

/** ORDER BY for unfocused graph seed lists when capping node count. */
export function buildGraphTruncationOrderClause(basis?: GraphTruncationBasis): string {
    switch (basis) {
        case 'git-modified':
            // Non-null timestamps first, then newest first.
            return 'i.git_modified_at IS NULL ASC, i.git_modified_at DESC, i.file_uri ASC, i.line_start ASC';
        case 'git-created':
            return 'i.git_created_at IS NULL ASC, i.git_created_at DESC, i.file_uri ASC, i.line_start ASC';
        case 'path':
        default:
            return 'i.file_uri ASC, i.line_start ASC';
    }
}

export interface GraphViewQuery {
    centerId?: string;
    search?: string;
    pathFilter?: string;
    /** Multi-select status keys; may include FILTER_NOT_PRESENT for missing @status. */
    statusFilter?: string[];
    /** Multi-select tag keys; may include FILTER_NOT_PRESENT for missing @tags. */
    tagFilter?: string[];
    /** @deprecated Prefer hopDepth — true maps to depth 2 when hopDepth is omitted */
    includeIndirect: boolean;
    /** When false, omit edges produced by wildcard path+idea references. Default true. */
    includeWildcardRefs?: boolean;
    /** Neighbourhood hop depth from center (1 = direct edges only). */
    hopDepth?: number;
    maxNodes?: number;
    /** When true, do not clamp maxNodes to GRAPH_NODES_HARD_CAP (HTML export workspace graphs). */
    ignoreHardCap?: boolean;
    /** When true, include ideaset nodes in unfocused seed lists (HTML export). Default excludes them. */
    includeIdeasets?: boolean;
    /** When the matching set exceeds maxNodes, which ordering decides who stays. */
    truncationBasis?: GraphTruncationBasis;
}

export interface GraphNodeView {
    id: string;
    name: string;
    kind: string;
    fileUri: string;
    lineStart: number;
    status?: string;
    /** FILTER_NOT_PRESENT | FILTER_EMPTY | concrete @status value. */
    statusKey?: string;
    tags: string[];
    /** [FILTER_NOT_PRESENT] | [FILTER_EMPTY] | concrete tags. */
    tagsKeys?: string[];
    isExternal?: boolean;
    /** Synthetic leaf for a hosting .rq file (file treatment = linked). */
    isFileIdeaset?: boolean;
    hotspotBand?: 'low' | 'medium' | 'high';
}

export interface GraphEdgeView {
    id: string;
    sourceId: string;
    targetId: string;
    kind: string;
    label?: string;
}

export function isWildcardReferenceEdge(edge: { kind: string }): boolean {
    return edge.kind === 'wildcard_reference';
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
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (!query.includeIdeasets) {
        clauses.push("i.kind != 'ideaset'");
    }

    if (query.search?.trim()) {
        const pattern = `%${query.search.trim()}%`;
        clauses.push('(i.name LIKE ? OR i.summary LIKE ? OR i.file_uri LIKE ?)');
        params.push(pattern, pattern, pattern);
    }

    if (query.pathFilter?.trim()) {
        clauses.push('i.file_uri LIKE ?');
        params.push(`%${query.pathFilter.trim()}%`);
    }

    const statusFilters = normalizeFilterList(query.statusFilter);
    if (statusFilters.length) {
        const path = attributeJsonPath('status');
        const parts: string[] = [];
        const includeMissing = statusFilters.includes(FILTER_NOT_PRESENT);
        const includeEmpty = statusFilters.includes(FILTER_EMPTY);
        const concrete = statusFilters.filter(
            value => value !== FILTER_NOT_PRESENT && value !== FILTER_EMPTY
        );
        if (includeMissing) {
            parts.push(`json_extract(i.attributes_json, ?) IS NULL`);
            params.push(path);
        }
        if (includeEmpty) {
            parts.push(`(
                json_type(json_extract(i.attributes_json, ?)) = 'true'
                OR (
                    json_type(json_extract(i.attributes_json, ?)) = 'text'
                    AND TRIM(CAST(json_extract(i.attributes_json, ?) AS TEXT)) = ''
                )
                OR (
                    json_type(json_extract(i.attributes_json, ?)) = 'array'
                    AND json_array_length(json_extract(i.attributes_json, ?)) = 0
                )
            )`);
            params.push(path, path, path, path, path);
        }
        if (concrete.length) {
            parts.push(`json_extract(i.attributes_json, ?) IN (${concrete.map(() => '?').join(', ')})`);
            params.push(path, ...concrete);
        }
        clauses.push(`(${parts.join(' OR ')})`);
    }

    const tagFilters = normalizeFilterList(query.tagFilter);
    if (tagFilters.length) {
        const path = attributeJsonPath('tags');
        const parts: string[] = [];
        const includeMissing = tagFilters.includes(FILTER_NOT_PRESENT);
        const includeEmpty = tagFilters.includes(FILTER_EMPTY);
        const concrete = tagFilters.filter(
            value => value !== FILTER_NOT_PRESENT && value !== FILTER_EMPTY
        );
        if (includeMissing) {
            parts.push(`json_extract(i.attributes_json, ?) IS NULL`);
            params.push(path);
        }
        if (includeEmpty) {
            parts.push(`(
                json_type(json_extract(i.attributes_json, ?)) = 'true'
                OR (
                    json_type(json_extract(i.attributes_json, ?)) = 'text'
                    AND TRIM(CAST(json_extract(i.attributes_json, ?) AS TEXT)) = ''
                )
                OR (
                    json_type(json_extract(i.attributes_json, ?)) = 'array'
                    AND json_array_length(json_extract(i.attributes_json, ?)) = 0
                )
            )`);
            params.push(path, path, path, path, path);
        }
        for (const tag of concrete) {
            parts.push(`(
                json_extract(i.attributes_json, ?) LIKE ?
                OR EXISTS (
                    SELECT 1 FROM json_each(json_extract(i.attributes_json, ?))
                    WHERE value = ?
                )
            )`);
            params.push(path, `%${tag}%`, path, tag);
        }
        clauses.push(`(${parts.join(' OR ')})`);
    }

    return { sql: clauses.length > 0 ? clauses.join(' AND ') : '1=1', params };
}

function normalizeFilterList(value: string[] | string | undefined): string[] {
    if (Array.isArray(value)) {
        return value.map(entry => String(entry).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    return [];
}

export function toGraphNodeView(idea: IdeaSummary): GraphNodeView {
    return {
        id: idea.id,
        name: idea.name,
        kind: idea.kind,
        fileUri: idea.fileUri,
        lineStart: idea.lineStart,
        status: idea.status,
        statusKey: idea.statusKey,
        tags: idea.tags,
        tagsKeys: idea.tagsKeys
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

function externalGraphNode(targetFile: string, sourceId: string, label?: string): GraphNodeView {
    return {
        id: externalNodeId(targetFile),
        name: label ?? targetFile,
        kind: 'file',
        fileUri: resolveReferencedFilePath(targetFile, sourceId),
        lineStart: 0,
        tags: [],
        isExternal: true
    };
}

export async function buildGraphViewSlice(
    store: SqliteIndexStore,
    query: GraphViewQuery
): Promise<GraphViewSlice> {
    const requested = Math.max(1, query.maxNodes ?? GRAPH_MAX_NODES);
    const maxNodes = query.ignoreHardCap ? requested : Math.min(requested, GRAPH_NODES_HARD_CAP);
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

/**
 * Build a graph that contains exactly the given idea ids (including ideasets) plus
 * external file nodes for outbound file_reference edges. Used by HTML export so the
 * workspace graph matches the export idea list rather than the interactive UI budget.
 */
export async function buildGraphSliceForIdeaIds(
    store: SqliteIndexStore,
    ideaIds: readonly string[],
    options: { maxNodes?: number } = {}
): Promise<GraphViewSlice> {
    const uniqueIds = [...new Set(ideaIds)];
    const maxNodes = Math.max(1, options.maxNodes ?? uniqueIds.length);
    const query: GraphViewQuery = {
        includeIndirect: true,
        maxNodes,
        ignoreHardCap: true,
        includeIdeasets: true
    };
    if (uniqueIds.length === 0) {
        return {
            query,
            depth: 1,
            truncated: false,
            totalMatching: 0,
            nodes: [],
            edges: []
        };
    }
    const truncated = uniqueIds.length > maxNodes;
    const seedIds = truncated ? uniqueIds.slice(0, maxNodes) : uniqueIds;
    const seedNodes = await store.getIdeasByIds(seedIds);
    // Depth 1: keep the export scope closed — do not pull out-of-scope neighbours.
    return collectSliceFromSeeds(store, query, seedNodes, 1, maxNodes, truncated, uniqueIds.length);
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
    const includeWildcardRefs = query.includeWildcardRefs !== false;
    let frontier: string[] = [centerId];
    for (let level = 0; level < depth && frontier.length > 0; level += 1) {
        const frontierEdges = await store.getEdgesForNodes(frontier);
        const neighborIds = new Set<string>();
        for (const edge of frontierEdges) {
            if (!includeWildcardRefs && isWildcardReferenceEdge(edge)) {
                continue;
            }
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
            if (!includeWildcardRefs && isWildcardReferenceEdge(edge)) {
                continue;
            }
            edges.set(edge.id, edge);
        }
    }

    const nodeIds = new Set(nodes.keys());
    const visibleEdges = filterVisibleEdges(edges, nodeIds, includeWildcardRefs);
    return finalizeSlice(query, centerId, depth, truncated, undefined, nodes, visibleEdges);
}

/** Keep edges whose endpoints are both present (or whose target is an external file). */
function filterVisibleEdges(
    edges: Map<string, EdgeRecord>,
    nodeIds: Set<string>,
    includeWildcardRefs = true
): Map<string, EdgeRecord> {
    const visible = new Map<string, EdgeRecord>();
    for (const edge of edges.values()) {
        if (!includeWildcardRefs && isWildcardReferenceEdge(edge)) {
            continue;
        }
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
    const includeWildcardRefs = query.includeWildcardRefs !== false;

    // One batched query for every edge incident to a seed, replacing the
    // per-seed inbound/outbound fan-out.
    const seedEdges = await store.getEdgesForNodes(seedNodes.map(node => node.id));
    const edges = new Map<string, EdgeRecord>();
    for (const edge of seedEdges) {
        if (!includeWildcardRefs && isWildcardReferenceEdge(edge)) {
            continue;
        }
        edges.set(edge.id, edge);
    }

    if (depth > 1) {
        const neighborIds = new Set<string>();
        for (const edge of edges.values()) {
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
    const visibleEdges = filterVisibleEdges(edges, nodeIds, includeWildcardRefs);

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
                graphNodes.set(externalId, externalGraphNode(edge.targetFile, edge.sourceId, edge.label));
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

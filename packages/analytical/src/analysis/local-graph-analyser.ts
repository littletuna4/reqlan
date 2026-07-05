import type { Analyser } from './analyser-registry.js';
import type { EdgeRecord, GraphSlice, IdeaSummary } from '../core/types.js';

export const localGraphAnalyser: Analyser<{ centerId: string; depth?: number }, GraphSlice> = {
    id: 'local_graph_analysis',
    async run({ store }, { centerId, depth = 1 }) {
        const center = await store.getIdea(centerId);
        if (!center) {
            return { centerId, depth, nodes: [], edges: [] };
        }

        const nodes = new Map<string, IdeaSummary>();
        const edges = new Map<string, EdgeRecord>();
        const visited = new Set<string>();
        const queue: Array<{ id: string; remaining: number }> = [{ id: centerId, remaining: depth }];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current.id)) {
                continue;
            }
            visited.add(current.id);
            const idea = await store.getIdea(current.id);
            if (idea) {
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

        return {
            centerId,
            depth,
            nodes: [...nodes.values()],
            edges: [...edges.values()]
        };
    }
};

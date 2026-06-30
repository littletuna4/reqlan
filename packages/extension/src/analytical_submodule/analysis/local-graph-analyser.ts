import type { Analyser } from './analyser-registry.js';
import type { GraphSlice, IdeaSummary } from '../core/types.js';

export const localGraphAnalyser: Analyser<{ centerId: string; depth?: number }, GraphSlice> = {
    id: 'local_graph_analysis',
    run({ store }, { centerId, depth = 1 }) {
        const center = store.getIdea(centerId);
        if (!center) {
            return { centerId, depth, nodes: [], edges: [] };
        }

        const nodes = new Map<string, IdeaSummary>();
        const edges = new Map<string, ReturnType<typeof store.getEdgesFrom>[number]>();
        const visited = new Set<string>();
        const queue: Array<{ id: string; remaining: number }> = [{ id: centerId, remaining: depth }];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current.id)) {
                continue;
            }
            visited.add(current.id);
            const idea = store.getIdea(current.id);
            if (idea) {
                nodes.set(idea.id, idea);
            }

            const outbound = store.getEdgesFrom(current.id);
            const inbound = store.getEdgesTo(current.id);
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

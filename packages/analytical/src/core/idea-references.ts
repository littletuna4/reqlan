import type { IdeaSummary } from './types.js';

export interface IdeaReferenceStore {
    listReferencesForIdea(ideaId: string): Promise<
        Array<{
            direction: 'inbound' | 'outbound';
            sourceIdeaId?: string;
            targetIdeaId?: string;
        }>
    >;
    getIdea(id: string): Promise<IdeaSummary | undefined>;
}

export async function resolveBidirectionalIdeaReferences(
    store: IdeaReferenceStore,
    ideaId: string
): Promise<{ inbound: IdeaSummary[]; outbound: IdeaSummary[] }> {
    const rows = await store.listReferencesForIdea(ideaId);
    const inbound: IdeaSummary[] = [];
    const outbound: IdeaSummary[] = [];
    const seenInbound = new Set<string>();
    const seenOutbound = new Set<string>();

    for (const row of rows) {
        if (row.direction === 'inbound' && row.sourceIdeaId && !seenInbound.has(row.sourceIdeaId)) {
            seenInbound.add(row.sourceIdeaId);
            const idea = await store.getIdea(row.sourceIdeaId);
            if (idea) {
                inbound.push(idea);
            }
        }
        if (row.direction === 'outbound' && row.targetIdeaId && !seenOutbound.has(row.targetIdeaId)) {
            seenOutbound.add(row.targetIdeaId);
            const idea = await store.getIdea(row.targetIdeaId);
            if (idea) {
                outbound.push(idea);
            }
        }
    }

    return { inbound, outbound };
}

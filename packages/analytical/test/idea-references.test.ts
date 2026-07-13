import { describe, expect, test } from 'vitest';
import { resolveBidirectionalIdeaReferences } from '../src/core/idea-references.js';
import type { IdeaSummary, ReferenceListRow } from '../src/core/types.js';

function mockIdea(id: string, fileUri: string, lineStart: number): IdeaSummary {
    return {
        id,
        name: id.split('#')[1]!,
        kind: 'block',
        fileUri,
        lineStart,
        lineEnd: lineStart + 2,
        summary: '',
        tags: []
    };
}

function createMockStore(referenceRows: ReferenceListRow[]) {
    const ideas = new Map<string, IdeaSummary>();
    return {
        listReferencesForIdea: async (ideaId: string) =>
            referenceRows.filter(row =>
                row.direction === 'outbound' ? row.sourceIdeaId === ideaId : row.targetIdeaId === ideaId
            ),
        getIdea: async (id: string) => ideas.get(id),
        seed(idea: IdeaSummary) {
            ideas.set(idea.id, idea);
        }
    };
}

describe('resolveBidirectionalIdeaReferences', () => {
    test('returns inbound and outbound ideas for a focused requirement', async () => {
        const fileUri = 'graph.rq';
        const reframeId = `${fileUri}#reframe_view`;
        const manualId = `${fileUri}#manual_reframe`;
        const autoId = `${fileUri}#auto_reframe`;
        const referenceRows: ReferenceListRow[] = [
            {
                edgeId: 'e1',
                direction: 'outbound',
                kind: 'references',
                label: 'manual_reframe',
                targetName: 'manual_reframe',
                targetPath: fileUri,
                isResolved: true,
                sourceIdeaId: reframeId,
                targetIdeaId: manualId
            },
            {
                edgeId: 'e2',
                direction: 'outbound',
                kind: 'references',
                label: 'auto_reframe',
                targetName: 'auto_reframe',
                targetPath: fileUri,
                isResolved: true,
                sourceIdeaId: reframeId,
                targetIdeaId: autoId
            },
            {
                edgeId: 'e1',
                direction: 'inbound',
                kind: 'references',
                label: 'manual_reframe',
                targetName: 'reframe_view',
                targetPath: fileUri,
                isResolved: true,
                sourceIdeaId: reframeId,
                targetIdeaId: manualId
            }
        ];
        const store = createMockStore(referenceRows);
        store.seed(mockIdea(reframeId, fileUri, 70));
        store.seed(mockIdea(manualId, fileUri, 82));
        store.seed(mockIdea(autoId, fileUri, 89));

        const reframeRefs = await resolveBidirectionalIdeaReferences(store, reframeId);
        expect(reframeRefs.inbound.map(idea => idea.name)).toEqual([]);
        expect(reframeRefs.outbound.map(idea => idea.name).sort()).toEqual(['auto_reframe', 'manual_reframe']);

        const manualRefs = await resolveBidirectionalIdeaReferences(store, manualId);
        expect(manualRefs.inbound.map(idea => idea.name)).toEqual(['reframe_view']);
        expect(manualRefs.outbound.map(idea => idea.name)).toEqual([]);
    });
});

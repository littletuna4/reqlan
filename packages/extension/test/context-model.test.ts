import { describe, expect, test } from 'vitest';
import {
    createContextSession,
    pinManualIdea,
    recordFileVisit,
    setDimensionEnabled
} from '../src/activity_bar_module/context-session.js';
import { ContextModelBuilder } from '../src/activity_bar_module/context-model.js';
import type { IdeaSummary } from 'reqlan-analytical';

function mockIdea(id: string, fileUri: string, lineStart: number): IdeaSummary {
    return {
        id,
        name: id,
        kind: 'block',
        fileUri,
        lineStart,
        lineEnd: lineStart + 2,
        summary: '',
        tags: []
    };
}

function createMockStore() {
    const ideas = new Map<string, IdeaSummary>();
    return {
        listIdeasInFileWithRanges: async (fileUri: string) =>
            [...ideas.values()].filter(idea => idea.fileUri === fileUri).map(idea => ({ ...idea })),
        getIdea: async (id: string) => ideas.get(id),
        getIdeaAtLine: async (fileUri: string, line: number) => {
            for (const idea of ideas.values()) {
                if (idea.fileUri === fileUri && idea.lineStart <= line && idea.lineEnd >= line) {
                    return idea;
                }
            }
            return undefined;
        },
        countUnresolvedForIdea: async () => 0,
        listReferencesForIdea: async () => [],
        seed(idea: IdeaSummary) {
            ideas.set(idea.id, idea);
        }
    };
}

describe('ContextModelBuilder', () => {
    test('merges enabled dimensions into footprint with summary line', async () => {
        const store = createMockStore();
        store.seed(mockIdea('a.rq#a', 'a.rq', 0));
        const session = createContextSession();
        recordFileVisit(session, 'b.rq');
        pinManualIdea(session, mockIdea('pin#1', 'pin.rq', 0));

        const builder = new ContextModelBuilder(store as never, uri => uri);
        const model = await builder.build({
            session,
            fileUri: 'a.rq',
            line: 0,
            openFileUris: ['c.rq'],
            workspace: { ready: true, ideaCount: 10, edgeCount: 5 }
        });

        expect(model.footprint.fileUris).toEqual(expect.arrayContaining(['a.rq', 'c.rq', 'b.rq', 'pin.rq']));
        expect(model.footprint.ideaIds).toEqual(expect.arrayContaining(['a.rq#a', 'pin#1']));
        expect(model.footprint.summaryLine).toContain('this file');
        expect(model.dimensions.find(dim => dim.id === 'manual')?.ideaCount).toBe(1);
    });

    test('disabled dimensions are omitted from footprint', async () => {
        const store = createMockStore();
        store.seed(mockIdea('a.rq#a', 'a.rq', 0));
        const session = createContextSession();
        recordFileVisit(session, 'b.rq');
        setDimensionEnabled(session, 'file_history', false);

        const builder = new ContextModelBuilder(store as never, uri => uri);
        const model = await builder.build({
            session,
            fileUri: 'a.rq',
            line: 0,
            openFileUris: [],
            workspace: { ready: true, ideaCount: 1, edgeCount: 0 }
        });

        expect(model.footprint.fileUris).not.toContain('b.rq');
        expect(model.fileHistory).toHaveLength(0);
    });
});

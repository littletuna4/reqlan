import { describe, expect, test } from 'vitest';
import {
    createContextSession,
    pinManualIdea,
    recordFileVisit,
    setDimensionEnabled
} from '../src/activity_bar_module/context-session.js';
import { ContextModelBuilder, ActivityBarDataService } from '../src/activity_bar_module/context-model.js';
import type { IdeaSummary } from 'reqlan-analytical';

function mockIdea(id: string, fileUri: string, lineStart: number, extra?: Partial<IdeaSummary>): IdeaSummary {
    return {
        id,
        name: id,
        kind: 'block',
        fileUri,
        lineStart,
        lineEnd: lineStart + 2,
        summary: '',
        tags: [],
        ...extra
    } as IdeaSummary;
}

function createMockStore() {
    const ideas = new Map<string, IdeaSummary>();
    const inbound = new Map<string, IdeaSummary[]>();
    const outbound = new Map<string, IdeaSummary[]>();
    return {
        listIdeasInFileWithRanges: async (fileUri: string) =>
            [...ideas.values()].filter(idea => idea.fileUri === fileUri).map(idea => ({ ...idea, lineEnd: idea.lineStart + 2 })),
        getIdea: async (id: string) => ideas.get(id),
        getIdeaAtLine: async (fileUri: string, line: number) => {
            for (const idea of ideas.values()) {
                if (idea.fileUri === fileUri && idea.lineStart <= line && (idea.lineStart + 2) >= line) {
                    return idea;
                }
            }
            return undefined;
        },
        countUnresolvedForIdea: async () => 0,
        listReferencesForIdea: async (ideaId: string) => {
            const rows = [
                ...(inbound.get(ideaId) ?? []).map(idea => ({
                    edgeId: `in-${idea.id}`,
                    direction: 'inbound' as const,
                    kind: 'references' as const,
                    label: idea.name,
                    targetName: idea.name,
                    targetPath: idea.fileUri,
                    isResolved: true,
                    sourceIdeaId: idea.id,
                    targetIdeaId: ideaId
                })),
                ...(outbound.get(ideaId) ?? []).map(idea => ({
                    edgeId: `out-${idea.id}`,
                    direction: 'outbound' as const,
                    kind: 'references' as const,
                    label: idea.name,
                    targetName: idea.name,
                    targetPath: idea.fileUri,
                    isResolved: true,
                    sourceIdeaId: ideaId,
                    targetIdeaId: idea.id
                }))
            ];
            return rows;
        },
        listReferencesWithinHopDepth: async (ideaId: string) => {
            const rows = [
                ...(inbound.get(ideaId) ?? []).map(idea => ({
                    edgeId: `in-${idea.id}`,
                    direction: 'inbound' as const,
                    kind: 'references' as const,
                    label: idea.name,
                    targetName: idea.name,
                    targetPath: idea.fileUri,
                    isResolved: true,
                    sourceIdeaId: idea.id,
                    targetIdeaId: ideaId
                })),
                ...(outbound.get(ideaId) ?? []).map(idea => ({
                    edgeId: `out-${idea.id}`,
                    direction: 'outbound' as const,
                    kind: 'references' as const,
                    label: idea.name,
                    targetName: idea.name,
                    targetPath: idea.fileUri,
                    isResolved: true,
                    sourceIdeaId: ideaId,
                    targetIdeaId: idea.id
                }))
            ];
            return rows;
        },
        listAncestorChain: async (ideaId: string) => inbound.get(ideaId)?.slice(0, 1) ?? [],
        buildAncestorChainResult: async (ideaId: string) => ({
            ideaId,
            ancestors: inbound.get(ideaId)?.slice(0, 1) ?? [],
            statusRollup: {},
            blocking: []
        }),
        seed(idea: IdeaSummary) {
            ideas.set(idea.id, idea);
        },
        link(from: string, to: string) {
            const source = ideas.get(from);
            const target = ideas.get(to);
            if (!source || !target) {
                return;
            }
            outbound.set(from, [...(outbound.get(from) ?? []), target]);
            inbound.set(to, [...(inbound.get(to) ?? []), source]);
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
        expect(model.signals?.focusIdeaId).toBe('a.rq#a');
        expect(model.synthesis).toBeDefined();
        expect(model.fingerprint).toBeDefined();
        expect(model.aiReadiness).toBeDefined();
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

    test('populates relationship signals from refs and dates', async () => {
        const store = createMockStore();
        const focus = mockIdea('a.rq#a', 'a.rq', 0, {
            status: 'incomplete',
            gitCreatedAt: '2024-01-01T00:00:00Z',
            gitModifiedAt: '2026-07-01T00:00:00Z'
        });
        const parent = mockIdea('a.rq#p', 'a.rq', 10);
        const child = mockIdea('a.rq#c', 'a.rq', 20);
        store.seed(focus);
        store.seed(parent);
        store.seed(child);
        store.link('a.rq#p', 'a.rq#a');
        store.link('a.rq#a', 'a.rq#c');

        const builder = new ContextModelBuilder(store as never, uri => uri);
        const model = await builder.build({
            session: createContextSession(),
            fileUri: 'a.rq',
            line: 0,
            openFileUris: [],
            workspace: { ready: true, ideaCount: 3, edgeCount: 2 }
        });

        expect(model.signals?.relationship?.outboundCount).toBe(1);
        expect(model.signals?.relationship?.inboundCount).toBe(1);
        expect(model.signals?.developmentHistory?.createdAt).toBe('2024-01-01T00:00:00Z');
        expect(model.synthesis?.story.length).toBeGreaterThan(0);

        const markdown = await new ActivityBarDataService(store as never, uri => uri).buildContextMarkdown(model);
        expect(markdown).toContain('## Synthesis');
        expect(markdown).toContain('## Context fingerprint');
        expect(markdown).toContain('## AI readiness');
    });

    test('omits signals when focus is none', async () => {
        const store = createMockStore();
        const builder = new ContextModelBuilder(store as never, uri => uri);
        const model = await builder.build({
            session: createContextSession(),
            openFileUris: [],
            workspace: { ready: true, ideaCount: 0, edgeCount: 0 }
        });
        expect(model.signals).toBeUndefined();
        expect(model.synthesis).toBeUndefined();
    });
});

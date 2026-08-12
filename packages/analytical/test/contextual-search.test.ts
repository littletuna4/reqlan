/**
 * Context-biased search scoring and ref resolution.
 * rq:["../../reqlan rq/core_analysis/search.rq".contextual_search]
 */
import { describe, expect, test } from 'vitest';
import { FILTER_NOT_PRESENT } from '../src/core/filter-specials.js';
import type { EdgeRecord, IdeaSummary, SemanticMatch } from '../src/core/types.js';
import {
    applyContextDistanceScoring,
    CONTEXT_UNREACHABLE_HOP,
    normalizeContextRef,
    rerankMatchesWithContext,
    resolveSearchContextRefs,
    type SearchContextIndex,
    type SearchContextStore
} from '../src/analysis/contextual-search.js';

function idea(partial: Partial<IdeaSummary> & Pick<IdeaSummary, 'name' | 'fileUri'>): IdeaSummary {
    return {
        id: partial.id ?? `${partial.fileUri}#${partial.name}`,
        name: partial.name,
        kind: partial.kind ?? 'block',
        fileUri: partial.fileUri,
        lineStart: partial.lineStart ?? 0,
        summary: partial.summary ?? '',
        statusKey: partial.statusKey ?? FILTER_NOT_PRESENT,
        tags: partial.tags ?? [],
        tagsKeys: partial.tagsKeys ?? [FILTER_NOT_PRESENT]
    };
}

function match(ideaSummary: IdeaSummary, score: number, reasons: string[] = ['name match']): SemanticMatch {
    return { idea: ideaSummary, score, reasons: [...reasons] };
}

function createMockStore(ideas: IdeaSummary[], edges: EdgeRecord[] = []): SearchContextStore {
    return {
        getIdea: async id => ideas.find(entry => entry.id === id),
        getIdeasInFile: async fileUri => ideas.filter(entry => entry.fileUri === fileUri),
        searchByNameOrSummary: async query =>
            ideas.filter(
                entry =>
                    entry.name.includes(query) || entry.summary.toLowerCase().includes(query.toLowerCase())
            ),
        getAllEdges: async () => edges
    };
}

const index: SearchContextIndex = {
    toIndexedUri: filePathOrUri => filePathOrUri.replace(/^\.\//, '')
};

describe('normalizeContextRef', () => {
    test('strips bracket wrappers', () => {
        expect(normalizeContextRef('  [fuzzy_search] ')).toBe('fuzzy_search');
        expect(normalizeContextRef('plain')).toBe('plain');
    });
});

describe('resolveSearchContextRefs', () => {
    const near = idea({ name: 'near', fileUri: 'core/search.rq' });
    const far = idea({ name: 'far', fileUri: 'other/file.rq' });
    const twin = idea({ name: 'near', fileUri: 'dup/search.rq' });
    const store = createMockStore([near, far, twin]);

    test('resolves path#name to a single idea', async () => {
        const ids = await resolveSearchContextRefs(index, store, ['core/search.rq#near']);
        expect(ids).toEqual([near.id]);
    });

    test('resolves .rq path to all ideas in that file', async () => {
        const ids = await resolveSearchContextRefs(index, store, ['core/search.rq']);
        expect(ids).toEqual([near.id]);
    });

    test('resolves bare name to all exact name matches', async () => {
        const ids = await resolveSearchContextRefs(index, store, ['near']);
        expect(ids.sort()).toEqual([near.id, twin.id].sort());
    });

    test('skips unknown tokens', async () => {
        const ids = await resolveSearchContextRefs(index, store, ['missing.rq', 'nope', 'core/search.rq#ghost']);
        expect(ids).toEqual([]);
    });
});

describe('applyContextDistanceScoring', () => {
    test('nearer ideas rank above farther with equal text scores', () => {
        const near = idea({ name: 'near', fileUri: 'a.rq' });
        const mid = idea({ name: 'mid', fileUri: 'b.rq' });
        const far = idea({ name: 'far', fileUri: 'c.rq' });
        const distances = new Map<string, number>([
            [near.id, 0],
            [mid.id, 1],
            [far.id, 2]
        ]);
        const ranked = applyContextDistanceScoring(
            [match(far, 4), match(mid, 4), match(near, 4)],
            distances
        ).sort((left, right) => right.score - left.score);

        expect(ranked.map(entry => entry.idea.name)).toEqual(['near', 'mid', 'far']);
        expect(ranked[0]!.score).toBe(4);
        expect(ranked[1]!.score).toBe(2);
        expect(ranked[2]!.score).toBe(1);
        expect(ranked[0]!.reasons).toContain('context:0 hops');
        expect(ranked[2]!.reasons).toContain('context:2 hops');
    });

    test('unreachable ideas use the floor hop', () => {
        const orphan = idea({ name: 'orphan', fileUri: 'x.rq' });
        const [scored] = applyContextDistanceScoring([match(orphan, 8)], new Map());
        expect(scored!.score).toBe(8 * Math.pow(0.5, CONTEXT_UNREACHABLE_HOP));
        expect(scored!.reasons).toContain('context:unreachable');
    });
});

describe('rerankMatchesWithContext', () => {
    test('re-ranks using graph edges from context seeds', async () => {
        const seed = idea({ name: 'seed', fileUri: 'a.rq' });
        const near = idea({ name: 'near_hit', fileUri: 'b.rq' });
        const far = idea({ name: 'far_hit', fileUri: 'c.rq' });
        const edges: EdgeRecord[] = [
            {
                id: 'e1',
                sourceId: seed.id,
                targetId: near.id,
                kind: 'references'
            },
            {
                id: 'e2',
                sourceId: near.id,
                targetId: far.id,
                kind: 'references'
            }
        ];
        const store = createMockStore([seed, near, far], edges);
        const ranked = await rerankMatchesWithContext(
            store,
            [match(far, 4), match(near, 4)],
            [seed.id]
        );
        expect(ranked.map(entry => entry.idea.name)).toEqual(['near_hit', 'far_hit']);
    });

    test('leaves matches unchanged when context is empty', async () => {
        const a = idea({ name: 'a', fileUri: 'a.rq' });
        const b = idea({ name: 'b', fileUri: 'b.rq' });
        const store = createMockStore([a, b]);
        const input = [match(a, 3), match(b, 5)];
        const ranked = await rerankMatchesWithContext(store, input, []);
        expect(ranked).toEqual(input);
    });
});

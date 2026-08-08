/**
 * Fuzzy idea search with interchangeable separators.
 * rq:["../../reqlan rq/core_analysis/search.rq".fuzzy_search]
 */
import { describe, expect, test } from 'vitest';
import { FILTER_NOT_PRESENT } from '../src/core/filter-specials.js';
import type { IdeaSummary } from '../src/core/types.js';
import {
    filterAndScoreIdeas,
    filterAndScoreIdeasAsync,
    fuzzySubsequence,
    normalizeSearchSeparators
} from '../src/analysis/fuzzy-search.js';
import { Worker } from 'node:worker_threads';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FuzzySearchWorkerClient } from '../src/analysis/fuzzy-search-worker-client.js';

function idea(partial: Partial<IdeaSummary> & Pick<IdeaSummary, 'name'>): IdeaSummary {
    return {
        id: partial.id ?? partial.name,
        name: partial.name,
        kind: partial.kind ?? 'block',
        fileUri: partial.fileUri ?? `file:///workspace/${partial.name}.rq`,
        lineStart: partial.lineStart ?? 0,
        summary: partial.summary ?? '',
        statusKey: partial.statusKey ?? FILTER_NOT_PRESENT,
        tags: partial.tags ?? [],
        tagsKeys: partial.tagsKeys ?? [FILTER_NOT_PRESENT]
    };
}

describe('normalizeSearchSeparators', () => {
    test('collapses underscore, hyphen, dots/ellipsis, and whitespace', () => {
        expect(normalizeSearchSeparators('cli_package')).toBe('clipackage');
        expect(normalizeSearchSeparators('cli-package')).toBe('clipackage');
        expect(normalizeSearchSeparators('cli package')).toBe('clipackage');
        expect(normalizeSearchSeparators('cli...package')).toBe('clipackage');
        expect(normalizeSearchSeparators('cli…package')).toBe('clipackage');
        expect(normalizeSearchSeparators('  CLI__Package  ')).toBe('clipackage');
    });
});

describe('filterAndScoreIdeas', () => {
    test('ranks exact and prefix matches ahead of subsequence fuzzy hits', () => {
        const ideas = [
            idea({ name: 'search_code_actions', summary: 'code action search' }),
            idea({ name: 'sea_code', summary: '' }),
            idea({ name: 'other', summary: 'mentions search somewhere' }),
            idea({ name: 'ideaset_only', kind: 'ideaset' })
        ];

        const exact = filterAndScoreIdeas(ideas, 'search_code_actions');
        expect(exact[0]?.name).toBe('search_code_actions');
        expect(exact.some(hit => hit.name === 'ideaset_only')).toBe(false);

        const partial = filterAndScoreIdeas(ideas, 'search');
        expect(partial.map(hit => hit.name)).toContain('search_code_actions');
        expect(partial.map(hit => hit.name)).toContain('other');

        const fuzzy = filterAndScoreIdeas(ideas, 'sca');
        expect(fuzzy.some(hit => hit.name === 'search_code_actions')).toBe(true);
    });

    test('matches across separator substitutions', () => {
        const ideas = [
            idea({ name: 'cli_package', summary: 'CLI package' }),
            idea({ name: 'search-code-actions', summary: '' }),
            idea({ name: 'parent_nodes_pane', summary: '' })
        ];

        expect(filterAndScoreIdeas(ideas, 'cli package')[0]?.name).toBe('cli_package');
        expect(filterAndScoreIdeas(ideas, 'cli-package')[0]?.name).toBe('cli_package');
        expect(filterAndScoreIdeas(ideas, 'search code actions')[0]?.name).toBe('search-code-actions');
        expect(filterAndScoreIdeas(ideas, 'parent...nodes')[0]?.name).toBe('parent_nodes_pane');
    });

    test('empty query returns all non-ideaset ideas', () => {
        const ideas = [
            idea({ name: 'alpha' }),
            idea({ name: 'beta', kind: 'oneliner' }),
            idea({ name: 'gamma', kind: 'ideaset' })
        ];
        const hits = filterAndScoreIdeas(ideas, '');
        expect(hits.map(hit => hit.name).sort()).toEqual(['alpha', 'beta']);
    });
});

describe('filterAndScoreIdeasAsync', () => {
    test('matches sync ranking and aborts when cancelled', async () => {
        const ideas = Array.from({ length: 20 }, (_, index) =>
            idea({ name: `idea_${index}`, summary: index === 7 ? 'needle here' : '' })
        );
        const sync = filterAndScoreIdeas(ideas, 'needle');
        const asyncHits = await filterAndScoreIdeasAsync(ideas, 'needle', { chunkSize: 5 });
        expect(asyncHits?.map(hit => hit.name)).toEqual(sync.map(hit => hit.name));

        let calls = 0;
        const cancelled = await filterAndScoreIdeasAsync(ideas, 'idea', {
            chunkSize: 3,
            isCancelled: () => {
                calls += 1;
                return calls > 2;
            }
        });
        expect(cancelled).toBeUndefined();
    });
});

describe('fuzzySubsequence', () => {
    test('matches characters in order', () => {
        expect(fuzzySubsequence('search_code_actions', 'sca')).toBe(true);
        expect(fuzzySubsequence('search_code_actions', 'xyz')).toBe(false);
    });
});

describe('FuzzySearchWorkerClient', () => {
    test('scores catalog off-thread', async () => {
        const workerSource = join(dirname(fileURLToPath(import.meta.url)), '../src/analysis/fuzzy-search-worker.ts');
        // Prefer compiled JS next to out/ when present (vitest usually loads TS via vite).
        const compiled = join(dirname(fileURLToPath(import.meta.url)), '../out/analysis/fuzzy-search-worker.js');
        const { existsSync } = await import('node:fs');
        const workerPath = existsSync(compiled) ? compiled : workerSource;

        const client = new FuzzySearchWorkerClient({ workerPath });
        try {
            await client.setCatalog([
                idea({ name: 'cli_package', summary: 'CLI' }),
                idea({ name: 'other_thing' })
            ]);
            const result = await client.search('cli package', 1, { limit: 10, requireQuery: true });
            expect(result.hits[0]?.name).toBe('cli_package');
            expect(result.total).toBeGreaterThanOrEqual(1);
        } finally {
            client.dispose();
        }
    }, 15_000);
});

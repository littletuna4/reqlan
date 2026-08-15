/**
 * Fuzzy idea search with interchangeable separators.
 * rq:["../../reqlan rq/core_analysis/search.rq".fuzzy_search]
 * rq:["../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
 * rq:["../../reqlan rq/core_analysis/search.rq".file_search]
 * rq:["../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
 */
import { describe, expect, test } from 'vitest';
import { FILTER_NOT_PRESENT } from '../src/core/filter-specials.js';
import type { IdeaSummary } from '../src/core/types.js';
import {
    filterAndScoreFiles,
    filterAndScoreIdeas,
    filterAndScoreIdeasAsync,
    findSearchHighlightRanges,
    fuzzySubsequence,
    matchQueryTokens,
    normalizeSearchSeparators,
    searchIndex,
    splitSearchHighlight,
    splitSearchTokens
} from '../src/analysis/fuzzy-search.js';
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

describe('splitSearchTokens', () => {
    test('splits on interchangeable separators', () => {
        expect(splitSearchTokens('cli_package')).toEqual(['cli', 'package']);
        expect(splitSearchTokens('search-code-actions')).toEqual(['search', 'code', 'actions']);
        expect(splitSearchTokens('parent...nodes pane')).toEqual(['parent', 'nodes', 'pane']);
        expect(splitSearchTokens('  CLI__Package  ')).toEqual(['cli', 'package']);
    });
});

describe('matchQueryTokens', () => {
    test('prefers order, allows reordering and missing hay words', () => {
        expect(matchQueryTokens(['search', 'code', 'actions'], ['search', 'actions'])).toBe('ordered');
        expect(matchQueryTokens(['cli', 'package'], ['package', 'cli'])).toBe('reordered');
        expect(matchQueryTokens(['cli', 'package'], ['cli', 'package', 'extra'])).toBe(null);
        expect(matchQueryTokens(['search', 'code', 'actions'], ['sea'])).toBe('ordered');
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

    test('matches reordered and partial word queries', () => {
        const ideas = [
            idea({ name: 'cli_package', summary: '' }),
            idea({ name: 'search_code_actions', summary: '' }),
            idea({ name: 'parent_nodes_pane', summary: '' }),
            idea({ name: 'unrelated_thing', summary: '' })
        ];

        const reordered = filterAndScoreIdeas(ideas, 'package cli');
        expect(reordered[0]?.name).toBe('cli_package');
        expect(reordered.some(hit => hit.name === 'unrelated_thing')).toBe(false);

        const missingMiddle = filterAndScoreIdeas(ideas, 'search actions');
        expect(missingMiddle[0]?.name).toBe('search_code_actions');

        const orderedBeatsReordered = filterAndScoreIdeas(
            [
                idea({ name: 'actions_search' }),
                idea({ name: 'search_code_actions' })
            ],
            'search actions'
        );
        expect(orderedBeatsReordered[0]?.name).toBe('search_code_actions');
        expect(orderedBeatsReordered[0]!.score).toBeGreaterThan(orderedBeatsReordered[1]!.score);
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

describe('filterAndScoreFiles', () => {
    // rq:["../../reqlan rq/core_analysis/search.rq".file_search]
    test('ranks file name hits with ideas', () => {
        const ideas = [
            idea({ name: 'cli_package', summary: 'CLI package' }),
            idea({ name: 'unrelated', summary: '' })
        ];
        const files = [
            'reqlan rq/core_analysis/search.rq',
            'packages/cli/cli_package.rq'
        ];
        const byBasename = filterAndScoreFiles(files, 'search');
        expect(byBasename[0]?.name).toBe('search.rq');
        expect(byBasename[0]?.kind).toBe('file');
        expect(byBasename[0]?.lineStart).toBe(0);

        const mixed = searchIndex(ideas, files, 'search', { limit: 8, requireQuery: true });
        expect(mixed.hits.some(hit => hit.kind === 'file' && hit.name === 'search.rq')).toBe(true);
        expect(mixed.hits.some(hit => hit.name === 'cli_package')).toBe(false);
    });

    test('empty query does not dump files', () => {
        const files = ['reqlan rq/core_analysis/search.rq'];
        expect(filterAndScoreFiles(files, '')).toEqual([]);
        expect(searchIndex([], files, '', { requireQuery: true }).hits).toEqual([]);
        expect(searchIndex([], files, '   ').hits).toEqual([]);
    });
});

describe('searchIndex pages', () => {
    // rq:["../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
    test('pages ranked hits with offset and truncated', () => {
        const ideas = Array.from({ length: 5 }, (_, index) =>
            idea({ name: `alpha_${index}`, summary: 'shared' })
        );
        const first = searchIndex(ideas, [], 'alpha', { limit: 2, offset: 0, requireQuery: true });
        expect(first.hits).toHaveLength(2);
        expect(first.total).toBe(5);
        expect(first.truncated).toBe(true);

        const second = searchIndex(ideas, [], 'alpha', { limit: 2, offset: 2, requireQuery: true });
        expect(second.hits).toHaveLength(2);
        expect(second.truncated).toBe(true);
        expect(first.hits[0]?.name).not.toBe(second.hits[0]?.name);

        const last = searchIndex(ideas, [], 'alpha', { limit: 2, offset: 4, requireQuery: true });
        expect(last.hits).toHaveLength(1);
        expect(last.truncated).toBe(false);
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

function highlighted(hay: string, query: string, allowSparseFuzzy = false): string {
    return splitSearchHighlight(hay, query, { allowSparseFuzzy })
        .map(part => (part.matched ? `[${part.text}]` : part.text))
        .join('');
}

describe('findSearchHighlightRanges', () => {
    test('highlights exact and prefix substrings', () => {
        expect(highlighted('search_code_actions', 'sea')).toBe('[sea]rch_code_actions');
        expect(highlighted('CLI package', 'cli package')).toBe('[CLI package]');
        expect(findSearchHighlightRanges('search_code_actions', '')).toEqual([]);
    });

    test('maps separator-insensitive matches back onto the original text', () => {
        expect(highlighted('cli_package', 'cli package')).toBe('[cli_package]');
        expect(highlighted('cli_package', 'cli-package')).toBe('[cli_package]');
        expect(highlighted('cli_package', 'clipack')).toBe('[cli_pack]age');
    });

    test('highlights token prefixes and reordered words', () => {
        expect(highlighted('search_code_actions', 'search actions')).toBe('[search]_code_[actions]');
        expect(highlighted('cli_package', 'package cli')).toBe('[cli]_[package]');
        expect(highlighted('search_code_actions', 'sea act')).toBe('[sea]rch_code_[act]ions');
    });

    test('highlights acronym and sparse fuzzy matches on short fields', () => {
        expect(highlighted('search_code_actions', 'sca', true)).toBe('[s]earch_[c]ode_[a]ctions');
        expect(highlighted('search_code_actions', 'srch', true)).toBe('[s]ea[rch]_code_actions');
        expect(highlighted('parent_nodes_pane', 'pde', true)).toBe('[p]arent_no[de]s_pane');
        expect(findSearchHighlightRanges('a long summary about widgets and layout', 'sca')).toEqual([]);
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

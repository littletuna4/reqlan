/**
 * Fuzzy/partial scoring and import path helpers for the reference search modal.
 * rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import { describe, expect, test } from 'vitest';
import type { IdeaSummary } from '@reqlan/analytical';
import {
    isSameIndexedFile,
    relativeImportPathForIndexedFile
} from '../src/extension/reference-search-import-path.js';
import { filterAndScoreIdeas } from '../src/extension/reference-search-scoring.js';

function idea(partial: Partial<IdeaSummary> & Pick<IdeaSummary, 'name'>): IdeaSummary {
    return {
        id: partial.id ?? partial.name,
        name: partial.name,
        kind: partial.kind ?? 'block',
        fileUri: partial.fileUri ?? `file:///workspace/${partial.name}.rq`,
        lineStart: partial.lineStart ?? 0,
        summary: partial.summary ?? '',
        tags: partial.tags ?? []
    };
}

describe('filterAndScoreIdeas', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
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

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
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

describe('relativeImportPathForIndexedFile', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('resolves workspace-relative index paths against the document', () => {
        const documentUri = 'file:///home/tony/reqlan/reqlan%20rq/extension/features-commands.rq';
        const workspaceRoot = '/home/tony/reqlan';

        expect(
            relativeImportPathForIndexedFile(documentUri, 'site/reqs/showcase.rq', workspaceRoot)
        ).toBe('../../site/reqs/showcase.rq');

        expect(
            relativeImportPathForIndexedFile(
                documentUri,
                'reqlan rq/extension/configuration.rq',
                workspaceRoot
            )
        ).toBe('./configuration.rq');

        expect(
            isSameIndexedFile(
                documentUri,
                'reqlan rq/extension/features-commands.rq',
                workspaceRoot
            )
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('accepts absolute file:// index URIs', () => {
        expect(
            relativeImportPathForIndexedFile(
                'file:///workspace/app/consumer.rq',
                'file:///workspace/lib/shared.rq'
            )
        ).toBe('../lib/shared.rq');
    });
});

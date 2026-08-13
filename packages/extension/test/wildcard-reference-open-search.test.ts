/**
 * rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
 * rq:["../../../reqlan rq/language/imports.rq".idea_path_filter]
 * rq:["../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_seed]
 */
import { describe, expect, test } from 'vitest';
import type { IdeaSummary } from '@reqlan/analytical';
import {
    globPatternToSearchQuery,
    matchesIdeaPathFilter,
    wildcardSearchSeed
} from '../src/activity_bar_module/idea-path-filter.js';
import { buildWildcardMatchesPayload } from '../src/activity_bar_module/wildcard-matches-payload.js';

function idea(partial: Partial<IdeaSummary> & Pick<IdeaSummary, 'name' | 'fileUri'>): IdeaSummary {
    return {
        id: `${partial.fileUri}#${partial.name}`,
        kind: 'block',
        lineStart: 0,
        summary: '',
        statusKey: partial.status ?? '__not_present__',
        tags: [],
        tagsKeys: ['__not_present__'],
        ...partial
    };
}

describe('wildcard reference open search helpers', () => {
    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
    test('globPatternToSearchQuery strips meta for fuzzy query', () => {
        expect(globPatternToSearchQuery('import_*')).toBe('import');
        expect(globPatternToSearchQuery('*_pane')).toBe('pane');
        expect(globPatternToSearchQuery('widget_*_v2')).toBe('widget v2');
    });

    // rq:["../../../reqlan rq/language/imports.rq".idea_path_filter]
    test('matchesIdeaPathFilter applies glob against relative path', () => {
        expect(
            matchesIdeaPathFilter(
                'packages/extension/src/foo.rq',
                'file:///workspace/packages/extension/src/foo.rq',
                '**/extension/**/*.rq'
            )
        ).toBe(true);
        expect(
            matchesIdeaPathFilter(
                'packages/language/src/bar.rq',
                'file:///workspace/packages/language/src/bar.rq',
                '**/extension/**/*.rq'
            )
        ).toBe(false);
        expect(
            matchesIdeaPathFilter(
                'mods/alpha.rq',
                'file:///workspace/mods/alpha.rq',
                './mods/*.rq'
            )
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
    test('e2e: wildcardSearchSeed maps command args to focusIdeaSearch payload', () => {
        expect(
            wildcardSearchSeed({
                pathPattern: './mods/*.rq',
                ideaPattern: 'import_*'
            })
        ).toEqual({
            query: 'import',
            pathFilter: './mods/*.rq'
        });
        expect(
            wildcardSearchSeed({
                pathPattern: '@/extension/**/*.rq',
                ideaPattern: '*_pane'
            })
        ).toEqual({
            query: 'pane',
            pathFilter: '@/extension/**/*.rq'
        });
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
    // rq:["../../../reqlan rq/language/imports.rq".idea_path_filter]
    test('e2e: command args → seed → pathFilter gates search hits', () => {
        const seed = wildcardSearchSeed({
            pathPattern: '../extension/**/*.rq',
            ideaPattern: '*_pane'
        });
        expect(seed.query).toBe('pane');
        expect(seed.pathFilter).toBe('../extension/**/*.rq');

        const hits = [
            {
                name: 'search_pane',
                relativePath: 'reqlan rq/extension/module/activitybar-panels/search.rq',
                fileUri: 'file:///workspace/reqlan%20rq/extension/module/activitybar-panels/search.rq'
            },
            {
                name: 'workspace_pane',
                relativePath: 'reqlan rq/extension/module/activitybar-panels/workspace.rq',
                fileUri: 'file:///workspace/reqlan%20rq/extension/module/activitybar-panels/workspace.rq'
            },
            {
                name: 'import_pane_like',
                relativePath: 'reqlan rq/language/imports.rq',
                fileUri: 'file:///workspace/reqlan%20rq/language/imports.rq'
            }
        ];

        const filtered = hits.filter(
            hit =>
                hit.name.includes(seed.query) &&
                matchesIdeaPathFilter(hit.relativePath, hit.fileUri, seed.pathFilter)
        );
        expect(filtered.map(hit => hit.name).sort()).toEqual(['search_pane', 'workspace_pane']);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
    test('e2e: buildWildcardMatchesPayload lists stats, ideas, and files', () => {
        const catalog = [
            idea({
                name: 'search_pane',
                fileUri: 'file:///ws/reqlan rq/extension/module/activitybar-panels/search.rq',
                summary: 'Search pane',
                status: 'done',
                lineStart: 13
            }),
            idea({
                name: 'workspace_pane',
                fileUri: 'file:///ws/reqlan rq/extension/module/activitybar-panels/workspace.rq',
                summary: 'Workspace pane',
                status: 'done',
                lineStart: 4
            }),
            idea({
                name: 'import_tokenisation',
                fileUri: 'file:///ws/reqlan rq/language/imports.rq',
                summary: 'Import tokens',
                status: 'done'
            }),
            idea({
                name: 'other_pane',
                fileUri: 'file:///ws/reqlan rq/language/imports.rq',
                summary: 'Wrong path'
            })
        ];

        const payload = buildWildcardMatchesPayload(
            {
                pathPattern: '../extension/**/*.rq',
                ideaPattern: '*_pane'
            },
            catalog,
            fileUri => fileUri.replace(/^file:\/\/\/ws\//, '')
        );

        expect(payload.stats.ideaCount).toBe(2);
        expect(payload.stats.fileCount).toBe(2);
        expect(payload.stats.ideaPattern).toBe('*_pane');
        expect(payload.stats.statusCounts).toEqual([{ status: 'done', count: 2 }]);
        expect(payload.ideas.map(hit => hit.name).sort()).toEqual(['search_pane', 'workspace_pane']);
        expect(payload.files).toHaveLength(2);
        expect(payload.files.every(file => file.ideaCount === 1)).toBe(true);
    });
});

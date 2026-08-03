import { describe, expect, test } from 'vitest';
import type { BaseStatusView } from '../src/webview_module/shared/messages.js';
import {
    baseOptionMeta,
    baseStatusHint,
    filterBases
} from '../webviews/activity-bar/lib/filter-bases.js';

function base(partial: Partial<BaseStatusView> & Pick<BaseStatusView, 'id' | 'label' | 'root'>): BaseStatusView {
    return {
        ready: true,
        ideaCount: 0,
        edgeCount: 0,
        fileIssueCount: 0,
        state: 'ready',
        ...partial
    };
}

describe('filterBases', () => {
    const bases = [
        base({ id: 'a', label: 'core', root: '/workspace/packages/core' }),
        base({ id: 'b', label: 'docs', root: '/workspace/docs-site' }),
        base({ id: 'c', label: 'extension', root: '/workspace/packages/extension' })
    ];

    test('returns all bases for empty query', () => {
        expect(filterBases(bases, '')).toEqual(bases);
        expect(filterBases(bases, '   ')).toEqual(bases);
    });

    test('matches label case-insensitively', () => {
        expect(filterBases(bases, 'DOC').map((item) => item.id)).toEqual(['b']);
    });

    test('matches root path', () => {
        expect(filterBases(bases, 'packages').map((item) => item.id)).toEqual(['a', 'c']);
    });
});

describe('base status helpers', () => {
    test('baseStatusHint includes ready and issues', () => {
        expect(baseStatusHint(base({ id: 'a', label: 'a', root: '/a', ready: true }))).toBe('ready');
        expect(
            baseStatusHint(
                base({ id: 'a', label: 'a', root: '/a', ready: false, state: 'syncing', fileIssueCount: 2 })
            )
        ).toBe('syncing · 2 issues');
    });

    test('baseOptionMeta includes counts', () => {
        expect(
            baseOptionMeta(
                base({ id: 'a', label: 'a', root: '/a', ideaCount: 3, edgeCount: 4, fileIssueCount: 1 })
            )
        ).toBe('ready · 3 ideas · 4 refs · 1 issues');
    });
});

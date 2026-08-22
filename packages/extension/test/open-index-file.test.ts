/**
 * rq:["../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_open_live_file]
 */
import { describe, expect, test } from 'vitest';
import { pickOpenWorkspaceDocument } from '../src/analytical_submodule/index-store/open-index-file-pick.js';

function doc(fsPath: string, href: string) {
    return { uri: { fsPath, toString: () => href } };
}

describe('pickOpenWorkspaceDocument', () => {
    const live = doc('/ws/syntax.rq', 'file:///ws/syntax.rq');
    const stale = doc('/ws/syntax.rq', 'file:///detached/syntax.rq');
    const other = doc('/ws/other.rq', 'file:///ws/other.rq');

    test('prefers the document whose URI matches the workspace target', () => {
        expect(pickOpenWorkspaceDocument([stale, live], live.uri)).toBe(live);
    });

    test('ignores files that are not the same path', () => {
        expect(pickOpenWorkspaceDocument([other], live.uri)).toBeUndefined();
    });
});

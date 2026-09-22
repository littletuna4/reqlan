/**
 * Expand a renamed directory into the files that moved with it.
 * rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
 * rq:["../../../reqlan rq/extension/mutation/mutation-hooks.rq".rename_file]
 */
import { describe, expect, test } from 'vitest';
import { expandRenamedPaths } from '../src/mutation_module/expand-renamed-paths.js';

describe('expandRenamedPaths', () => {
    // rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
    // rq:["../../../reqlan rq/extension/mutation/mutation-hooks.rq".rename_file]
    test('pairs each file under a renamed folder with its old path', async () => {
        const expanded = await expandRenamedPaths(
            [{ oldPath: '/ws/oldname', newPath: '/ws/newname' }],
            async path => path === '/ws/newname',
            async () => ['/ws/newname/foo.rq', '/ws/newname/nested/bar.ts']
        );
        expect(expanded).toEqual([
            { oldPath: '/ws/oldname', newPath: '/ws/newname' },
            { oldPath: '/ws/oldname/foo.rq', newPath: '/ws/newname/foo.rq' },
            { oldPath: '/ws/oldname/nested/bar.ts', newPath: '/ws/newname/nested/bar.ts' }
        ]);
    });

    // rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
    test('keeps a renamed file and does not duplicate paths already listed', async () => {
        const expanded = await expandRenamedPaths(
            [
                { oldPath: '/ws/oldname', newPath: '/ws/newname' },
                { oldPath: '/ws/oldname/foo.rq', newPath: '/ws/newname/foo.rq' }
            ],
            async path => path === '/ws/newname',
            async () => ['/ws/newname/foo.rq']
        );
        expect(expanded).toEqual([
            { oldPath: '/ws/oldname', newPath: '/ws/newname' },
            { oldPath: '/ws/oldname/foo.rq', newPath: '/ws/newname/foo.rq' }
        ]);
    });
});

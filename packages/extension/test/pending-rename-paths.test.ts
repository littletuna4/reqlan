/**
 * Pending rename path matching for watcher delete/create suppression.
 * rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
 * rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_changes]
 * rq:["../../../reqlan rq/extension/mutation/mutation-hooks.rq".rename_file]
 */
import { describe, expect, test } from 'vitest';
import {
    PendingRenamePaths,
    pathIsUnderOrEqual
} from '../src/analytical_submodule/index-store/pending-rename-paths.js';

describe('PendingRenamePaths', () => {
    // rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
    // rq:["../../../reqlan rq/extension/mutation/mutation-hooks.rq".rename_file]
    test('suppresses watcher delete of the pre-move file until cleared', () => {
        const pending = new PendingRenamePaths();
        pending.note([{ oldPath: '/ws/a/foo.rq', newPath: '/ws/a/bar.rq' }]);
        expect(pending.shouldSuppressDelete('/ws/a/foo.rq')).toBe(true);
        expect(pending.shouldSuppressDelete('/ws/a/other.rq')).toBe(false);
        expect(pending.shouldSuppressCreate('/ws/a/bar.rq')).toBe(true);
        expect(pending.shouldSuppressCreate('/ws/a/foo.rq')).toBe(false);
        pending.clear([{ oldPath: '/ws/a/foo.rq', newPath: '/ws/a/bar.rq' }]);
        expect(pending.shouldSuppressDelete('/ws/a/foo.rq')).toBe(false);
        expect(pending.shouldSuppressCreate('/ws/a/bar.rq')).toBe(false);
    });

    // rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
    // rq:["../../../reqlan rq/extension/mutation/mutation-hooks.rq".rename_file]
    test('suppresses deletes under a renamed folder', () => {
        const pending = new PendingRenamePaths();
        pending.note([{ oldPath: '/ws/oldname', newPath: '/ws/newname' }]);
        expect(pending.shouldSuppressDelete('/ws/oldname')).toBe(true);
        expect(pending.shouldSuppressDelete('/ws/oldname/foo.rq')).toBe(true);
        expect(pending.shouldSuppressDelete('/ws/oldname/nested/bar.ts')).toBe(true);
        expect(pending.shouldSuppressDelete('/ws/oldname-other/foo.rq')).toBe(false);
        expect(pending.shouldSuppressCreate('/ws/newname/foo.rq')).toBe(true);
    });

    test('pathIsUnderOrEqual requires a path boundary', () => {
        expect(pathIsUnderOrEqual('/ws/oldname/foo.rq', '/ws/oldname')).toBe(true);
        expect(pathIsUnderOrEqual('/ws/oldname-extra/foo.rq', '/ws/oldname')).toBe(false);
    });
});

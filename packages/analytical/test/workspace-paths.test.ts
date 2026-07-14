import { describe, expect, test } from 'vitest';
import { toWorkspaceRelativePath } from '../src/core/workspace-paths.js';

const workspaceRoot = 'C:\\Users\\tony\\reqlan';

describe('toWorkspaceRelativePath', () => {
    test('relativizes Windows absolute fsPath', () => {
        expect(
            toWorkspaceRelativePath('C:\\Users\\tony\\reqlan\\reqlan rq\\extension\\scope.rq', workspaceRoot)
        ).toBe('reqlan rq/extension/scope.rq');
    });

    test('relativizes file:// URI on Windows', () => {
        expect(
            toWorkspaceRelativePath(
                'file:///c%3A/Users/tony/reqlan/reqlan%20rq/extension/scope.rq',
                workspaceRoot
            )
        ).toBe('reqlan rq/extension/scope.rq');
    });

    test('leaves already-relative paths unchanged', () => {
        expect(toWorkspaceRelativePath('reqlan rq/extension/scope.rq', workspaceRoot)).toBe(
            'reqlan rq/extension/scope.rq'
        );
    });

    test('relativizes POSIX absolute paths', () => {
        const posixRoot = '/home/tony/reqlan';
        expect(toWorkspaceRelativePath('/home/tony/reqlan/reqlan rq/foo.rq', posixRoot)).toBe(
            'reqlan rq/foo.rq'
        );
    });
});

import { describe, expect, test } from 'vitest';
import { toWorkspaceRelativePath, resolveWorkspaceFileUri } from '../src/core/workspace-paths.js';

const workspaceRoot = 'C:\\Users\\tony\\reqlan';

describe('toWorkspaceRelativePath', () => {
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
    test('relativizes Windows absolute fsPath', () => {
        expect(
            toWorkspaceRelativePath('C:\\Users\\tony\\reqlan\\reqlan rq\\extension\\host\\scope.rq', workspaceRoot)
        ).toBe('reqlan rq/extension/host/scope.rq');
    });

    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
    test('relativizes file:// URI on Windows', () => {
        expect(
            toWorkspaceRelativePath(
                'file:///c%3A/Users/tony/reqlan/reqlan%20rq/extension/host/scope.rq',
                workspaceRoot
            )
        ).toBe('reqlan rq/extension/host/scope.rq');
    });

    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
    test('relativizes mixed-case Windows paths', () => {
        expect(
            toWorkspaceRelativePath('c:\\Users\\tony\\reqlan\\reqlan rq\\extension\\host\\scope.rq', workspaceRoot)
        ).toBe('reqlan rq/extension/host/scope.rq');
    });

    test('leaves already-relative paths unchanged', () => {
        expect(toWorkspaceRelativePath('reqlan rq/extension/host/scope.rq', workspaceRoot)).toBe(
            'reqlan rq/extension/host/scope.rq'
        );
    });

    test('relativizes POSIX absolute paths', () => {
        const posixRoot = '/home/tony/reqlan';
        expect(toWorkspaceRelativePath('/home/tony/reqlan/reqlan rq/foo.rq', posixRoot)).toBe(
            'reqlan rq/foo.rq'
        );
    });
});

describe('resolveWorkspaceFileUri', () => {
    test('converts Windows drive paths to file: URIs', () => {
        const uri = resolveWorkspaceFileUri('C:\\Users\\tony\\reqlan\\foo.rq');
        expect(uri.startsWith('file:')).toBe(true);
        expect(new URL(uri).protocol).toBe('file:');
        expect(decodeURIComponent(uri).toLowerCase()).toContain('/c:/users/tony/reqlan/foo.rq');
    });
});

/**
 * rq:["../../../reqlan rq/extension/language-support/initialisation-and-sequencing.rq".lsp_file_watch]
 */
import { describe, expect, test } from 'vitest';
import { FileChangeType } from 'vscode-languageserver';
import {
    classifyWatchedUri,
    filterWatchedFileChanges,
    isNoisyWatchedUri,
    REQLAN_WATCHED_FILE_GLOBS
} from '../src/reqlan-document-update-handler.js';

describe('LSP file watch', () => {
    // rq:["../../../reqlan rq/extension/language-support/initialisation-and-sequencing.rq".lsp_file_watch]
    test('registers .rq globs only', () => {
        expect([...REQLAN_WATCHED_FILE_GLOBS]).toEqual(['**/*.rq']);
        expect(REQLAN_WATCHED_FILE_GLOBS).not.toContain('**/*');
    });

    // rq:["../../../reqlan rq/extension/language-support/initialisation-and-sequencing.rq".lsp_file_watch]
    test('classifies Windows and directory URIs by path segment', () => {
        expect(classifyWatchedUri('file:///C:/proj/src/foo.rq')).toBe('rq');
        expect(classifyWatchedUri('file:///C:/proj/node_modules')).toBe('node_modules');
        expect(classifyWatchedUri('file:///C:/proj/node_modules/pkg/x.rq')).toBe('node_modules');
        expect(classifyWatchedUri('file:///C:/proj/.git')).toBe('git');
        expect(classifyWatchedUri('file:///C:/proj/.git/HEAD')).toBe('git');
        expect(classifyWatchedUri('file:///C:/proj/.reqlan/ideas-index.sqlite')).toBe('reqlan_index');
        expect(classifyWatchedUri('file:///C:/proj/packages/extension/out/language/main.cjs')).toBe('build');
        expect(classifyWatchedUri('file:///C:/proj/.gitignore')).toBe('other');
        expect(classifyWatchedUri('file:///c%3A/proj/node_modules/pkg')).toBe('node_modules');
        expect(classifyWatchedUri('file:///C:/proj/src\\nested\\bar.rq')).toBe('rq');
    });

    // rq:["../../../reqlan rq/extension/language-support/initialisation-and-sequencing.rq".lsp_file_watch]
    test('drops noisy events and keeps .rq files', () => {
        const kept = filterWatchedFileChanges([
            { uri: 'file:///ws/src/a.rq', type: FileChangeType.Changed },
            { uri: 'file:///ws/node_modules/pkg/a.rq', type: FileChangeType.Changed },
            { uri: 'file:///ws/.git/objects/aa', type: FileChangeType.Created },
            { uri: 'file:///ws/.reqlan/ideas-index.sqlite', type: FileChangeType.Changed }
        ]);
        expect(kept.map(change => change.uri)).toEqual(['file:///ws/src/a.rq']);
        expect(isNoisyWatchedUri('file:///ws/node_modules')).toBe(true);
        expect(isNoisyWatchedUri('file:///ws/src/a.rq')).toBe(false);
    });
});

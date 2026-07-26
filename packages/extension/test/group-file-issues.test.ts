import { describe, expect, test } from 'vitest';
import type { FileIndexIssueView } from '../src/webview_module/shared/messages.js';
import {
    fileLabelFromIssue,
    groupFileIssuesByFile
} from '../webviews/activity-bar/lib/group-file-issues.js';

function issue(partial: Partial<FileIndexIssueView> & Pick<FileIndexIssueView, 'fileUri' | 'location'>): FileIndexIssueView {
    return {
        line: 0,
        column: 0,
        phase: 'parse',
        message: 'error',
        ...partial
    };
}

describe('groupFileIssuesByFile', () => {
    test('groups issues under each file and preserves order of first appearance', () => {
        const grouped = groupFileIssuesByFile([
            issue({ fileUri: 'file:///a.rq', location: 'a.rq:1:1', message: 'a1' }),
            issue({ fileUri: 'file:///b.rq', location: 'b.rq:2:1', message: 'b1' }),
            issue({ fileUri: 'file:///a.rq', location: 'a.rq:3:1', line: 2, message: 'a2' })
        ]);

        expect(grouped.map(g => g.fileUri)).toEqual(['file:///a.rq', 'file:///b.rq']);
        expect(grouped[0]?.issues.map(i => i.message)).toEqual(['a1', 'a2']);
        expect(grouped[0]?.label).toBe('a.rq');
        expect(grouped[1]?.issues).toHaveLength(1);
    });

    test('fileLabelFromIssue prefers path from location', () => {
        expect(
            fileLabelFromIssue(
                issue({
                    fileUri: 'file:///workspace/src/foo.rq',
                    location: 'src/foo.rq:10:2'
                })
            )
        ).toBe('src/foo.rq');
    });
});

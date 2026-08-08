import { describe, expect, test } from 'vitest';
import type { IndexStatusView } from '../src/webview_module/shared/messages.js';
import { indexStatusText } from '../webviews/ideas-summary/lib/index-status-text.js';

function status(partial: Partial<IndexStatusView>): IndexStatusView {
    return {
        state: 'ready',
        ready: true,
        ideaCount: 10,
        edgeCount: 4,
        fileIssueCount: 0,
        fileIssues: [],
        recentActivity: [],
        ...partial
    };
}

describe('indexStatusText', () => {
    test('ready healthy index is non-error copy', () => {
        expect(indexStatusText(status({}))).toEqual({
            text: '10 ideas, 4 references indexed',
            error: false
        });
    });

    test('ready with issues leads with the issue count', () => {
        expect(indexStatusText(status({ fileIssueCount: 3 }))).toEqual({
            text: '3 issue(s) from last index · 10 ideas, 4 references indexed',
            error: true
        });
    });

    test('ready with global lastError leads with the error summary', () => {
        expect(
            indexStatusText(
                status({
                    lastError: {
                        summary: 'SQLite locked',
                        phase: 'persist',
                        cause: 'busy'
                    }
                })
            )
        ).toEqual({
            text: 'SQLite locked · 10 ideas, 4 references indexed',
            error: true
        });
    });

    test('not-ready global error shows only the error', () => {
        expect(
            indexStatusText(
                status({
                    ready: false,
                    state: 'error',
                    lastError: {
                        summary: 'Failed to open index',
                        phase: 'open',
                        cause: 'io'
                    }
                })
            )
        ).toEqual({
            text: 'Failed to open index',
            error: true
        });
    });
});

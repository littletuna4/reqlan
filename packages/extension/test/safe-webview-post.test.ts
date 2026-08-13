import { describe, expect, test, vi } from 'vitest';
import {
    assignWebviewHtmlWithRetry,
    isWebviewUnavailableError,
    safeAssignWebviewHtml,
    safeWebviewPost
} from '../src/shared/safe-webview-post.js';

describe('isWebviewUnavailableError', () => {
    test('matches disposed and invalid-state host errors', () => {
        expect(isWebviewUnavailableError(new Error('Webview is disposed'))).toBe(true);
        expect(isWebviewUnavailableError(new Error('Webview is in an invalid state'))).toBe(true);
        expect(isWebviewUnavailableError('Error: Webview is in an invalid state')).toBe(true);
    });

    test('does not match unrelated errors', () => {
        expect(isWebviewUnavailableError(new Error('Index is not ready yet.'))).toBe(false);
        expect(isWebviewUnavailableError(undefined)).toBe(false);
    });
});

describe('safeWebviewPost', () => {
    test('no-ops when the webview is missing', () => {
        expect(() => safeWebviewPost(undefined, { type: 'ready' })).not.toThrow();
    });

    test('swallows synchronous unavailable errors', () => {
        const webview = {
            postMessage: () => {
                throw new Error('Webview is in an invalid state');
            }
        };
        expect(() => safeWebviewPost(webview, { type: 'tray' })).not.toThrow();
    });

    test('swallows rejected unavailable promises', async () => {
        const webview = {
            postMessage: () => Promise.reject(new Error('Webview is disposed'))
        };
        expect(() => safeWebviewPost(webview, { type: 'tray' })).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();
    });

    test('posts when the webview is live', async () => {
        const posted: unknown[] = [];
        const webview = {
            postMessage: (message: unknown) => {
                posted.push(message);
                return Promise.resolve(true);
            }
        };
        safeWebviewPost(webview, { type: 'ready' });
        await Promise.resolve();
        expect(posted).toEqual([{ type: 'ready' }]);
    });
});

describe('safeAssignWebviewHtml', () => {
    test('returns false when missing or unavailable', () => {
        expect(safeAssignWebviewHtml(undefined, '<p></p>')).toBe(false);
        expect(
            safeAssignWebviewHtml(
                {
                    set html(_value: string) {
                        throw new Error('Webview is disposed');
                    },
                    get html() {
                        return '';
                    }
                },
                '<p></p>'
            )
        ).toBe(false);
    });

    test('assigns html when the webview is live', () => {
        const webview = { html: '' };
        expect(safeAssignWebviewHtml(webview, '<p>ok</p>')).toBe(true);
        expect(webview.html).toBe('<p>ok</p>');
    });
});

describe('assignWebviewHtmlWithRetry', () => {
    test('yields once then assigns', async () => {
        const turns: string[] = [];
        const assigned = await assignWebviewHtmlWithRetry({
            isCurrent: () => true,
            assign: () => {
                turns.push('assign');
                return true;
            },
            yieldTurn: async () => {
                turns.push('yield');
            }
        });
        expect(assigned).toBe(true);
        expect(turns).toEqual(['yield', 'assign']);
    });

    test('retries after an invalid-state miss', async () => {
        const assign = vi.fn()
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true);
        const assigned = await assignWebviewHtmlWithRetry({
            isCurrent: () => true,
            assign,
            yieldTurn: async () => undefined
        });
        expect(assigned).toBe(true);
        expect(assign).toHaveBeenCalledTimes(2);
    });

    test('abandons when the view is replaced during the yield', async () => {
        let current = true;
        const assign = vi.fn(() => true);
        const assigned = await assignWebviewHtmlWithRetry({
            isCurrent: () => current,
            assign,
            yieldTurn: async () => {
                current = false;
            }
        });
        expect(assigned).toBe(false);
        expect(assign).not.toHaveBeenCalled();
    });

    test('abandons when the resolve token cancels', async () => {
        const assign = vi.fn(() => true);
        const assigned = await assignWebviewHtmlWithRetry({
            isCurrent: () => true,
            isCancelled: () => true,
            assign,
            yieldTurn: async () => undefined
        });
        expect(assigned).toBe(false);
        expect(assign).not.toHaveBeenCalled();
    });
});

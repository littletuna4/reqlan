/**
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */
import { describe, expect, test } from 'vitest';
import {
    caretChanged,
    SELECTION_KIND_COMMAND,
    shouldRecordDefinitionJump,
    type EditorCaret
} from '../src/extension/definition-navigation-stack.js';

const caret = (uri: string, line: number, character: number): EditorCaret => ({
    uri,
    line,
    character
});

describe('definition navigation stack', () => {
    test('records a command selection move as a definition jump', () => {
        const origin = caret('file:///a.rq', 1, 9);
        const target = caret('file:///a.rq', 3, 0);
        expect(shouldRecordDefinitionJump(SELECTION_KIND_COMMAND, origin, target)).toBe(true);
        expect(caretChanged(origin, target)).toBe(true);
    });

    test('ignores mouse and keyboard selection moves', () => {
        const origin = caret('file:///a.rq', 1, 9);
        const target = caret('file:///a.rq', 3, 0);
        expect(shouldRecordDefinitionJump(1, origin, target)).toBe(false);
        expect(shouldRecordDefinitionJump(2, origin, target)).toBe(false);
    });

    test('records an undefined-kind line jump when the host omits Command', () => {
        const origin = caret('file:///a.rq', 1, 9);
        const target = caret('file:///a.rq', 3, 0);
        expect(shouldRecordDefinitionJump(undefined, origin, target)).toBe(true);
        expect(
            shouldRecordDefinitionJump(undefined, origin, caret('file:///a.rq', 1, 12))
        ).toBe(false);
    });

    test('ignores a no-op command selection', () => {
        const origin = caret('file:///a.rq', 3, 0);
        expect(shouldRecordDefinitionJump(SELECTION_KIND_COMMAND, origin, origin)).toBe(false);
    });

    test('records a cross-file command jump from the prior caret', () => {
        const origin = caret('file:///a.rq', 1, 9);
        const target = caret('file:///b.rq', 0, 0);
        expect(shouldRecordDefinitionJump(SELECTION_KIND_COMMAND, origin, target)).toBe(true);
    });
});

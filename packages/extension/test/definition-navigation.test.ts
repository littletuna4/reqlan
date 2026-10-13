/**
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 * rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_navigate_back]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { COMMENT_REFERENCE_LANGUAGES } from '../src/extension/comment-reference-languages.js';
import {
    caretChanged,
    isNavigationTrackedLanguage,
    SELECTION_KIND_COMMAND,
    shouldRecordDefinitionJump,
    type EditorCaret
} from '../src/extension/definition-navigation-stack.js';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

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

    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_navigate_back]
    test('tracks comment-reference host languages for navigate-back', () => {
        expect(isNavigationTrackedLanguage('reqlan', 'a.rq', COMMENT_REFERENCE_LANGUAGES)).toBe(true);
        expect(isNavigationTrackedLanguage('plaintext', 'a.rq', COMMENT_REFERENCE_LANGUAGES)).toBe(true);
        expect(isNavigationTrackedLanguage('typescript', 'a.ts', COMMENT_REFERENCE_LANGUAGES)).toBe(true);
        expect(isNavigationTrackedLanguage('python', 'a.py', COMMENT_REFERENCE_LANGUAGES)).toBe(true);
        expect(isNavigationTrackedLanguage('markdown', 'a.md', COMMENT_REFERENCE_LANGUAGES)).toBe(false);
        expect(
            shouldRecordDefinitionJump(
                SELECTION_KIND_COMMAND,
                caret('file:///src/a.ts', 4, 8),
                caret('file:///reqs/b.rq', 0, 0)
            )
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_navigate_back]
    test('navigate-back keybinding is not limited to .rq editors', () => {
        const pkg = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8')) as {
            contributes: { keybindings: Array<{ command?: string; when?: string }> };
        };
        const binding = pkg.contributes.keybindings.find(
            item => item.command === 'reqlan.navigateBack'
        );
        expect(binding?.when).toBe('reqlan.canNavigateBack && editorTextFocus');
        expect(binding?.when).not.toContain('editorLangId');
    });
});

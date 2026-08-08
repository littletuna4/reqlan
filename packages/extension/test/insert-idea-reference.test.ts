/**
 * Import insertion helpers for idea reference edits.
 * rq:["../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane]
 * rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import { describe, expect, test } from 'vitest';
import { findPlainImportInsertLine } from '../src/extension/insert-idea-reference-helpers.js';

describe('findPlainImportInsertLine', () => {
    // rq:["../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane]
    test('inserts after existing imports', () => {
        const text = [
            'import "./a.rq" as a',
            'from "./b.rq" import beta',
            '',
            'idea {',
            '  body',
            '}'
        ].join('\n');
        expect(findPlainImportInsertLine(text)).toBe(2);
    });

    // rq:["../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane]
    test('inserts at top when no imports exist', () => {
        expect(findPlainImportInsertLine('idea {\n  body\n}\n')).toBe(0);
    });

    // rq:["../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane]
    test('skips leading blank lines and comments', () => {
        const text = ['// header', '', 'import "./a.rq" as a', 'idea {}'].join('\n');
        expect(findPlainImportInsertLine(text)).toBe(3);
    });
});

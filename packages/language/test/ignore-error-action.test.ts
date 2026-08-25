/**
 * Insert-edit for the ignore-error Quick Fix.
 * rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic, TextEdit } from 'vscode-languageserver';
import {
    buildRqIgnoreErrorLineInsert,
    createIgnoreErrorCodeActions,
    IGNORE_ERROR_ACTION_TITLE
} from '../src/reqlan-ignore-error-action.js';
import { findRqIgnoreErrorTargetLines } from '../src/reqlan-ignore-error.js';

function document(text: string): TextDocument {
    return TextDocument.create('file:///workspace/demo.rq', 'reqlan', 0, text);
}

function applyInsert(textDocument: TextDocument, edit: TextEdit): string {
    const start = textDocument.offsetAt(edit.range.start);
    const end = textDocument.offsetAt(edit.range.end);
    const text = textDocument.getText();
    return text.slice(0, start) + edit.newText + text.slice(end);
}

function diagnosticOnLine(line: number): Diagnostic {
    return {
        range: {
            start: { line, character: 4 },
            end: { line, character: 12 }
        },
        message: 'Could not resolve reference'
    };
}

describe('Ignore-error insert edit', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
    test('inserts indented ignore comment before the error line', () => {
        const textDocument = document('host {\n    [missing]\n}\n');
        const edit = buildRqIgnoreErrorLineInsert(textDocument, 1);
        expect(edit).toEqual({
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
            newText: '    //rq-ignore-error\n'
        });
        if (!edit) {
            return;
        }
        const updated = applyInsert(textDocument, edit);
        expect([...findRqIgnoreErrorTargetLines(updated)]).toEqual([2]);
        expect(updated).toBe('host {\n    //rq-ignore-error\n    [missing]\n}\n');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
    test('uses tab indent and CRLF when the error line uses them', () => {
        const textDocument = document('host {\r\n\t[missing]\r\n}\r\n');
        const edit = buildRqIgnoreErrorLineInsert(textDocument, 1);
        expect(edit?.newText).toBe('\t//rq-ignore-error\r\n');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
    test('wraps the ignore comment for a hash-comment error line', () => {
        const textDocument = document('def demo():\n    # rq:[missing]\n    pass\n');
        const edit = buildRqIgnoreErrorLineInsert(textDocument, 1);
        expect(edit?.newText).toBe('    # //rq-ignore-error\n');
        if (!edit) {
            return;
        }
        const updated = applyInsert(textDocument, edit);
        expect([...findRqIgnoreErrorTargetLines(updated)]).toEqual([2]);
        expect(updated).toBe('def demo():\n    # //rq-ignore-error\n    # rq:[missing]\n    pass\n');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
    test('inserts at the start of the file for a first-line error', () => {
        const textDocument = document('from "./gone.rq" import missing\n');
        const edit = buildRqIgnoreErrorLineInsert(textDocument, 0);
        expect(edit).toEqual({
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            newText: '//rq-ignore-error\n'
        });
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
    test('returns undefined for an out-of-range line', () => {
        const textDocument = document('host {\n}\n');
        expect(buildRqIgnoreErrorLineInsert(textDocument, -1)).toBeUndefined();
        expect(buildRqIgnoreErrorLineInsert(textDocument, 5)).toBeUndefined();
    });
});

describe('Ignore-error code actions', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
    test('offers one action per diagnostic line', () => {
        const textDocument = document('host {\n    [alpha]\n    [beta]\n}\n');
        const actions = createIgnoreErrorCodeActions(textDocument, [
            diagnosticOnLine(1),
            diagnosticOnLine(1),
            diagnosticOnLine(2)
        ]);
        expect(actions).toHaveLength(2);
        expect(actions.every(action => action.title === IGNORE_ERROR_ACTION_TITLE)).toBe(true);
        expect(actions[0]?.diagnostics).toHaveLength(2);
        expect(actions[1]?.diagnostics).toHaveLength(1);
        expect(actions[0]?.edit?.changes?.[textDocument.uri]?.[0]?.newText)
            .toBe('    //rq-ignore-error\n');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
    test('omits the action when //rq-ignore-error already suppresses the line', () => {
        const textDocument = document('host {\n    //rq-ignore-error\n    [missing]\n}\n');
        const actions = createIgnoreErrorCodeActions(textDocument, [diagnosticOnLine(2)]);
        expect(actions).toHaveLength(0);
    });
});

/**
 * Quick Fix that inserts `//rq-ignore-error` before a line with diagnostics.
 * rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CodeAction, Diagnostic, TextEdit } from 'vscode-languageserver';
import { CodeActionKind } from 'vscode-languageserver';
import { findRqIgnoreErrorTargetLines } from './reqlan-ignore-error.js';

export const IGNORE_ERROR_ACTION_TITLE = 'Ignore error with //rq-ignore-error';

const IGNORE_ERROR_COMMENT = '//rq-ignore-error';

/** One Quick Fix per diagnostic line that is not already suppressed. */
export function createIgnoreErrorCodeActions(
    textDocument: TextDocument,
    diagnostics: readonly Diagnostic[]
): CodeAction[] {
    const ignoredLines = findRqIgnoreErrorTargetLines(textDocument.getText());
    const diagnosticsByLine = new Map<number, Diagnostic[]>();
    for (const diagnostic of diagnostics) {
        const line = diagnostic.range.start.line;
        if (ignoredLines.has(line)) {
            continue;
        }
        const existing = diagnosticsByLine.get(line);
        if (existing) {
            existing.push(diagnostic);
        } else {
            diagnosticsByLine.set(line, [diagnostic]);
        }
    }

    const actions: CodeAction[] = [];
    for (const [line, lineDiagnostics] of diagnosticsByLine) {
        const edit = buildRqIgnoreErrorLineInsert(textDocument, line);
        if (!edit) {
            continue;
        }
        actions.push({
            title: IGNORE_ERROR_ACTION_TITLE,
            kind: CodeActionKind.QuickFix,
            diagnostics: lineDiagnostics,
            edit: {
                changes: {
                    [textDocument.uri]: [edit]
                }
            }
        });
    }
    return actions;
}

/**
 * Insert `//rq-ignore-error` at the start of `errorLine` (0-based), with the
 * same indent as that line and the document line ending.
 */
export function buildRqIgnoreErrorLineInsert(
    textDocument: TextDocument,
    errorLine: number
): TextEdit | undefined {
    if (errorLine < 0 || errorLine >= textDocument.lineCount) {
        return undefined;
    }
    const indent = leadingWhitespaceOfLine(textDocument, errorLine);
    const prefix = hashCommentPrefix(textOfLine(textDocument, errorLine));
    const eol = newlineForInsert(textDocument, errorLine);
    return {
        range: {
            start: { line: errorLine, character: 0 },
            end: { line: errorLine, character: 0 }
        },
        newText: `${indent}${prefix}${IGNORE_ERROR_COMMENT}${eol}`
    };
}

function leadingWhitespaceOfLine(textDocument: TextDocument, line: number): string {
    const lineText = textOfLine(textDocument, line);
    let end = 0;
    while (end < lineText.length) {
        const ch = lineText[end];
        if (ch !== ' ' && ch !== '\t') {
            break;
        }
        end += 1;
    }
    return lineText.slice(0, end);
}

function hashCommentPrefix(lineText: string): string {
    return lineText.trimStart().startsWith('#') ? '# ' : '';
}

function textOfLine(textDocument: TextDocument, line: number): string {
    const start = { line, character: 0 };
    if (line + 1 < textDocument.lineCount) {
        const raw = textDocument.getText({ start, end: { line: line + 1, character: 0 } });
        if (raw.endsWith('\r\n')) {
            return raw.slice(0, -2);
        }
        if (raw.endsWith('\n')) {
            return raw.slice(0, -1);
        }
        return raw;
    }
    return textDocument.getText({
        start,
        end: { line, character: Number.MAX_SAFE_INTEGER }
    });
}

function newlineForInsert(textDocument: TextDocument, errorLine: number): '\n' | '\r\n' {
    if (errorLine + 1 < textDocument.lineCount) {
        const raw = textDocument.getText({
            start: { line: errorLine, character: 0 },
            end: { line: errorLine + 1, character: 0 }
        });
        return raw.endsWith('\r\n') ? '\r\n' : '\n';
    }
    return textDocument.getText().includes('\r\n') ? '\r\n' : '\n';
}

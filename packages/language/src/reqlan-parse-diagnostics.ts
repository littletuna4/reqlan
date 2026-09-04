/**
 * Convert Chevrotain lex/parse errors on `parseResult` into LSP diagnostics.
 * Used at Parsed so the editor does not wait for Validated to see parse failures.
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 */
import { CstUtils, toDiagnosticSeverity, type LangiumDocument, type ParseResult } from 'langium';
import type { Diagnostic, Range } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { isReqlanIncompleteParseResult } from './reqlan-parse-budget.js';

const PARSE_DIAGNOSTIC_SOURCE = 'reqlan';
const ZERO_RANGE: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 }
};

export function collectLexParseDiagnostics(document: LangiumDocument): Diagnostic[] {
    const result = document.parseResult;
    const diagnostics: Diagnostic[] = [];
    for (const error of result.lexerErrors) {
        diagnostics.push(lexerErrorToDiagnostic(error));
    }
    for (const error of result.parserErrors) {
        diagnostics.push(parserErrorToDiagnostic(error));
    }
    if (isReqlanIncompleteParseResult(result) && diagnostics.length === 0) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: ZERO_RANGE,
            message: result.parserErrors[0]?.message ?? 'Lex/parse did not complete for this file.',
            source: PARSE_DIAGNOSTIC_SOURCE
        });
    }
    return diagnostics;
}

function lexerErrorToDiagnostic(error: ParseResult['lexerErrors'][number]): Diagnostic {
    return {
        severity: lexerErrorSeverity(error),
        range: lexerErrorRange(error),
        message: error.message,
        source: PARSE_DIAGNOSTIC_SOURCE
    };
}

function lexerErrorSeverity(error: ParseResult['lexerErrors'][number]): DiagnosticSeverity {
    if (!('severity' in error)) {
        return DiagnosticSeverity.Error;
    }
    const severity = error.severity;
    if (severity === 'error' || severity === 'warning' || severity === 'info' || severity === 'hint') {
        return toDiagnosticSeverity(severity);
    }
    return DiagnosticSeverity.Error;
}

function lexerErrorRange(error: ParseResult['lexerErrors'][number]): Range {
    const line = error.line;
    const column = error.column;
    if (typeof line !== 'number' || typeof column !== 'number'
        || Number.isNaN(line) || Number.isNaN(column) || line < 1 || column < 1) {
        return ZERO_RANGE;
    }
    const length = typeof error.length === 'number' && error.length > 0 ? error.length : 1;
    const startCharacter = column - 1;
    return {
        start: { line: line - 1, character: startCharacter },
        end: { line: line - 1, character: startCharacter + length }
    };
}

function parserErrorToDiagnostic(error: ParseResult['parserErrors'][number]): Diagnostic {
    return {
        severity: DiagnosticSeverity.Error,
        range: parserErrorRange(error),
        message: error.message,
        source: PARSE_DIAGNOSTIC_SOURCE
    };
}

function parserErrorRange(error: ParseResult['parserErrors'][number]): Range {
    const token = error.token;
    if (!token || Number.isNaN(token.startOffset)) {
        return ZERO_RANGE;
    }
    return CstUtils.tokenToRange(token);
}

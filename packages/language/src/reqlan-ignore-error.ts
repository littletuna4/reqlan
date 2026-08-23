/**
 * Langium glue: drop diagnostics on lines that `//rq-ignore-error` suppresses.
 * Line detection is the core Rust scanner (`find_rq_ignore_error_target_lines`).
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import { DocumentState, type LangiumDocument, type LangiumSharedCoreServices } from 'langium';
import type { Diagnostic } from 'vscode-languageserver';
import { findRqIgnoreErrorTargetLines as nativeFindRqIgnoreErrorTargetLines } from '@reqlan/analytical/core';

export function findRqIgnoreErrorTargetLines(text: string): Set<number> {
    return new Set(nativeFindRqIgnoreErrorTargetLines(text));
}

export function filterRqIgnoredDiagnostics(text: string, diagnostics: Diagnostic[]): Diagnostic[] {
    const ignoredLines = findRqIgnoreErrorTargetLines(text);
    if (ignoredLines.size === 0) {
        return diagnostics;
    }
    return diagnostics.filter(diagnostic => !ignoredLines.has(diagnostic.range.start.line));
}

export function applyRqIgnoreErrorFiltering(document: LangiumDocument): void {
    if (!document.diagnostics?.length) {
        return;
    }
    document.diagnostics = filterRqIgnoredDiagnostics(
        document.textDocument.getText(),
        document.diagnostics
    );
}

export function registerRqIgnoreErrorFiltering(shared: LangiumSharedCoreServices): void {
    shared.workspace.DocumentBuilder.onDocumentPhase(DocumentState.Validated, (document: LangiumDocument) => {
        applyRqIgnoreErrorFiltering(document);
    });
}

/**
 * Suppresses diagnostics on lines immediately following `//rq-ignore-error`.
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import { DocumentState, type LangiumDocument, type LangiumSharedCoreServices } from 'langium';
import type { Diagnostic } from 'vscode-languageserver';
import { findLineCommentStart } from './reqlan-comment-resolver.js';

const RQ_IGNORE_ERROR = /\/\/\s*rq-ignore-error\b/;

export function findRqIgnoreErrorTargetLines(text: string): Set<number> {
    const lines = text.split(/\r?\n/);
    const targetLines = new Set<number>();
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]!;
        const commentStart = findLineCommentStart(line);
        if (commentStart < 0) {
            continue;
        }
        const commentText = line.slice(commentStart);
        if (RQ_IGNORE_ERROR.test(commentText) && lineIndex + 1 < lines.length) {
            targetLines.add(lineIndex + 1);
        }
    }
    return targetLines;
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

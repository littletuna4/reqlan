/**
 * Locates bracketed quoted file paths in .rq source text, including @tests list entries.
 * Unbracketed quoted strings are body prose, not file references.
 * Skips inline code (`…`) and fenced ``` blocks — those are opaque examples, not live refs.
 * rq:["../../../reqlan rq/language/syntax.rq".inline_code]
 * rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
 * rq:["../../../reqlan rq/reference_types.rq".reference_edgecase]
 */
import type { LangiumDocument } from 'langium';
import type { Position, Range } from 'vscode-languageserver';
import { isRangeInsideMarkdownLinkLabel } from './reqlan-markdown-links.js';
import { parseReqlanQuotedString, REQLAN_QUOTED_STRING_CAPTURE } from './reqlan-quoted-strings.js';

export interface EmbeddedFileReference {
    file: string;
    range: Range;
}

const BRACKETED_FILE_REFERENCE_PATTERN = new RegExp(`\\[\\s*(${REQLAN_QUOTED_STRING_CAPTURE})\\s*\\]`, 'g');
const FILE_REFERENCE_LIKE = /(?:\.\w[\w.]*|\/)/;

export function findEmbeddedFileReferencesInText(text: string, lineOffset = 0): EmbeddedFileReference[] {
    const references: EmbeddedFileReference[] = [];
    const lines = text.split(/\r?\n/);
    let inFence = false;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (isCodeFenceLine(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }
        const opaque = inlineCodeSpans(line);
        for (const match of line.matchAll(BRACKETED_FILE_REFERENCE_PATTERN)) {
            pushEmbeddedReference(references, match, lineIndex, lineOffset, line, opaque);
        }
    }
    return references;
}

function isCodeFenceLine(line: string): boolean {
    return line.trimStart().startsWith('```');
}

function inlineCodeSpans(line: string): Array<{ start: number; end: number }> {
    const spans: Array<{ start: number; end: number }> = [];
    let index = 0;
    while (index < line.length) {
        if (line[index] !== '`') {
            index++;
            continue;
        }
        if (line.startsWith('```', index)) {
            index += 3;
            continue;
        }
        const close = line.indexOf('`', index + 1);
        if (close < 0) {
            break;
        }
        if (close > index + 1) {
            spans.push({ start: index, end: close + 1 });
        }
        index = close + 1;
    }
    return spans;
}

function rangeOverlapsOpaque(start: number, end: number, opaque: Array<{ start: number; end: number }>): boolean {
    return opaque.some(span => start < span.end && end > span.start);
}

function pushEmbeddedReference(
    references: EmbeddedFileReference[],
    match: RegExpMatchArray,
    lineIndex: number,
    lineOffset: number,
    line: string,
    opaque: Array<{ start: number; end: number }>
): void {
    const quoted = match[1];
    const file = parseReqlanQuotedString(quoted);
    if (!FILE_REFERENCE_LIKE.test(file)) {
        return;
    }
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (rangeOverlapsOpaque(start, end, opaque)) {
        return;
    }
    if (isRangeInsideMarkdownLinkLabel(line, start, end)) {
        return;
    }
    references.push({
        file,
        range: {
            start: { line: lineOffset + lineIndex, character: start },
            end: { line: lineOffset + lineIndex, character: end }
        }
    });
}

export function findEmbeddedFileReferenceAt(
    document: LangiumDocument,
    position: Position
): EmbeddedFileReference | undefined {
    const offset = document.textDocument.offsetAt(position);
    return findEmbeddedFileReferencesInText(document.textDocument.getText())
        .find(reference => {
            const start = document.textDocument.offsetAt(reference.range.start);
            const end = document.textDocument.offsetAt(reference.range.end);
            return offset >= start && offset <= end;
        });
}

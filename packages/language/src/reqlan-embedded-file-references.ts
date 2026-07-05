/**
 * Locates quoted file paths embedded in .rq source text, including @tests list entries.
 */
import type { LangiumDocument } from 'langium';
import type { Position, Range } from 'vscode-languageserver';
import { isRangeInsideMarkdownLinkLabel } from './reqlan-markdown-links.js';

export interface EmbeddedFileReference {
    file: string;
    range: Range;
}

const BRACKETED_FILE_REFERENCE_PATTERN = /\[\s*("(?:\\.|[^"\\])*")\s*\]/g;
const QUOTED_FILE_REFERENCE_PATTERN = /("(?:\\.|[^"\\])*")/g;
const FILE_REFERENCE_LIKE = /(?:\.\w[\w.]*|\/)/;

export function findEmbeddedFileReferencesInText(text: string, lineOffset = 0): EmbeddedFileReference[] {
    const references: EmbeddedFileReference[] = [];
    const lines = text.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        for (const match of line.matchAll(BRACKETED_FILE_REFERENCE_PATTERN)) {
            pushEmbeddedReference(references, match, lineIndex, lineOffset, line);
        }
        for (const match of line.matchAll(QUOTED_FILE_REFERENCE_PATTERN)) {
            if (line.slice(Math.max(0, (match.index ?? 0) - 1), match.index).includes('[')) {
                continue;
            }
            pushEmbeddedReference(references, match, lineIndex, lineOffset, line);
        }
    }
    return references;
}

function pushEmbeddedReference(
    references: EmbeddedFileReference[],
    match: RegExpMatchArray,
    lineIndex: number,
    lineOffset: number,
    line: string
): void {
    const quoted = match[1];
    const file = JSON.parse(quoted) as string;
    if (!FILE_REFERENCE_LIKE.test(file)) {
        return;
    }
    const start = match.index ?? 0;
    if (isRangeInsideMarkdownLinkLabel(line, start, start + match[0].length)) {
        return;
    }
    references.push({
        file,
        range: {
            start: { line: lineOffset + lineIndex, character: start },
            end: { line: lineOffset + lineIndex, character: start + match[0].length }
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

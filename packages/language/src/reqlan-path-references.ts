/**
 * Collects relative file path strings in .rq imports and embedded references, and rq: paths in comments.
 */
import type { Range } from 'vscode-languageserver';
import { findCommentReferencesInText } from './reqlan-comment-resolver.js';
import { findEmbeddedFileReferencesInText } from './reqlan-embedded-file-references.js';
import { parseFileReferenceString } from './reqlan-file-references.js';
import type { PathReference } from './file-path-rewrite.js';

const IMPORT_PATH_PATTERN = /(?:\bfrom|\bimport)\s+("(?:\\.|[^"\\])*")/g;

export function findImportPathReferencesInText(text: string, lineOffset = 0): PathReference[] {
    const references: PathReference[] = [];
    const lines = text.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]!;
        for (const match of line.matchAll(IMPORT_PATH_PATTERN)) {
            const quoted = match[1]!;
            const path = JSON.parse(quoted) as string;
            const start = match.index! + match[0].indexOf(quoted);
            references.push({
                path,
                range: {
                    start: { line: lineOffset + lineIndex, character: start },
                    end: { line: lineOffset + lineIndex, character: start + quoted.length }
                }
            });
        }
    }
    return references;
}

export function findEmbeddedPathReferencesInText(text: string, lineOffset = 0): PathReference[] {
    const references: PathReference[] = [];
    for (const embedded of findEmbeddedFileReferencesInText(text, lineOffset)) {
        const parsed = parseFileReferenceString(embedded.file);
        if (!parsed.filePath) {
            continue;
        }
        const quoted = JSON.stringify(parsed.filePath);
        const embeddedText = text.slice(
            textOffsetAtPosition(text, embedded.range.start),
            textOffsetAtPosition(text, embedded.range.end)
        );
        const pathIndex = embeddedText.indexOf(quoted);
        if (pathIndex < 0) {
            continue;
        }
        const absoluteStart = textOffsetAtPosition(text, embedded.range.start) + pathIndex;
        const startPos = offsetToPosition(text, absoluteStart);
        references.push({
            path: parsed.filePath,
            range: {
                start: startPos,
                end: { line: startPos.line, character: startPos.character + quoted.length }
            }
        });
    }
    return references;
}

export function findCommentPathReferencesInText(text: string, lineOffset = 0): PathReference[] {
    const references: PathReference[] = [];
    for (const commentRef of findCommentReferencesInText(text, lineOffset)) {
        if (!commentRef.path) {
            continue;
        }
        const quoted = JSON.stringify(commentRef.path);
        const segmentStart = textOffsetAtPosition(text, commentRef.range.start);
        const segmentEnd = textOffsetAtPosition(text, commentRef.range.end);
        const segment = text.slice(segmentStart, segmentEnd);
        const pathIndex = segment.indexOf(quoted);
        if (pathIndex < 0) {
            continue;
        }
        const absoluteStart = segmentStart + pathIndex;
        const startPos = offsetToPosition(text, absoluteStart);
        references.push({
            path: commentRef.path,
            range: {
                start: startPos,
                end: { line: startPos.line, character: startPos.character + quoted.length }
            }
        });
    }
    return references;
}

export function findPathReferencesInMovedFile(text: string, isRqFile: boolean): PathReference[] {
    const references = isRqFile
        ? [...findImportPathReferencesInText(text), ...findEmbeddedPathReferencesInText(text)]
        : findCommentPathReferencesInText(text);
    return dedupePathReferences(references);
}

function dedupePathReferences(references: PathReference[]): PathReference[] {
    const seen = new Set<string>();
    const unique: PathReference[] = [];
    for (const reference of references) {
        const key = [
            reference.range.start.line,
            reference.range.start.character,
            reference.range.end.line,
            reference.range.end.character
        ].join(':');
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(reference);
    }
    return unique;
}

function textOffsetAtLine(text: string, lineIndex: number): number {
    const lines = text.split(/\r?\n/);
    let offset = 0;
    for (let index = 0; index < lineIndex; index++) {
        offset += lines[index]!.length + 1;
    }
    return offset;
}

function textOffsetAtPosition(text: string, position: Range['start']): number {
    return textOffsetAtLine(text, position.line) + position.character;
}

function offsetToPosition(text: string, offset: number): Range['start'] {
    const before = text.slice(0, offset);
    const lines = before.split(/\r?\n/);
    return {
        line: lines.length - 1,
        character: lines[lines.length - 1]!.length
    };
}

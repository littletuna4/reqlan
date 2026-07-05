/**
 * Locates and parses rq:[target] references embedded in source-file comments.
 */
import type { LangiumDocument, LangiumDocuments } from 'langium';
import { AstUtils, URI, UriUtils } from 'langium';
import type { Position, Range } from 'vscode-languageserver';
import { LocationLink } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findImportedDocument } from './reqlan-imports.js';
import { isIdea, isModel, isOneLinerIdea } from './generated/ast.js';

export interface EmbeddedCommentReference {
    path?: string;
    idea: string;
    range: Range;
}

export function createSourceTextDocument(uri: string, text: string): LangiumDocument {
    return {
        uri: URI.parse(uri),
        textDocument: TextDocument.create(uri, 'plaintext', 0, text)
    } as LangiumDocument;
}

const COMMENT_REFERENCE_PATTERN = /rq:\s*\[([^\]]+)\]/g;
const QUALIFIED_TARGET_PATTERN = /^("(?:\\.|[^"\\])*")\s*\.\s*([_a-zA-Z][\w_]*)(?:\s*\.\s*([_a-zA-Z][\w_]*))?$/;
const LOCAL_TARGET_PATTERN = /^([_a-zA-Z][\w_]*)$/;

interface CommentSpan {
    start: number;
    end: number;
}

/** Line comment start outside string literals; `//` after `:` (e.g. URLs) is not a comment. */
export function findLineCommentStart(line: string): number {
    let inDouble = false;
    let inSingle = false;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        const next = line[index + 1];
        if (inDouble || inSingle) {
            if (char === '\\') {
                index++;
                continue;
            }
            if (inDouble && char === '"') {
                inDouble = false;
            } else if (inSingle && char === "'") {
                inSingle = false;
            }
            continue;
        }
        if (char === '"') {
            inDouble = true;
            continue;
        }
        if (char === "'") {
            inSingle = true;
            continue;
        }
        if (char === '/' && next === '/') {
            let previousIndex = index - 1;
            while (previousIndex >= 0 && /[ \t]/.test(line[previousIndex]!)) {
                previousIndex--;
            }
            const previous = previousIndex >= 0 ? line[previousIndex]! : '';
            if (previous !== ':' && previous !== '/') {
                return index;
            }
            index++;
            continue;
        }
        if (char === '#') {
            return index;
        }
    }
    return -1;
}

export function findCommentSpansInText(text: string): CommentSpan[] {
    const spans: CommentSpan[] = [];
    let index = 0;
    let inDouble = false;
    let inSingle = false;
    let inLineComment = false;
    let blockComment: 'slash' | 'triple-single' | 'triple-double' | undefined;
    let lineCommentStart = -1;

    while (index < text.length) {
        const char = text[index];
        const next = text[index + 1];
        const next2 = text[index + 2];

        if (inLineComment) {
            if (char === '\n') {
                spans.push({ start: lineCommentStart, end: index });
                inLineComment = false;
                lineCommentStart = -1;
            }
            index++;
            continue;
        }

        if (blockComment) {
            if (blockComment === 'slash' && char === '*' && next === '/') {
                spans.push({ start: lineCommentStart, end: index + 2 });
                blockComment = undefined;
                lineCommentStart = -1;
                index += 2;
                continue;
            }
            if (blockComment === 'triple-single' && char === "'" && next === "'" && next2 === "'") {
                spans.push({ start: lineCommentStart, end: index + 3 });
                blockComment = undefined;
                lineCommentStart = -1;
                index += 3;
                continue;
            }
            if (blockComment === 'triple-double' && char === '"' && next === '"' && next2 === '"') {
                spans.push({ start: lineCommentStart, end: index + 3 });
                blockComment = undefined;
                lineCommentStart = -1;
                index += 3;
                continue;
            }
            index++;
            continue;
        }

        if (inDouble || inSingle) {
            if (char === '\\') {
                index += 2;
                continue;
            }
            if (inDouble && char === '"') {
                inDouble = false;
            } else if (inSingle && char === "'") {
                inSingle = false;
            }
            index++;
            continue;
        }

        if (char === '"') {
            if (next === '"' && next2 === '"') {
                blockComment = 'triple-double';
                lineCommentStart = index;
                index += 3;
                continue;
            }
            inDouble = true;
            index++;
            continue;
        }
        if (char === "'") {
            if (next === "'" && next2 === "'") {
                blockComment = 'triple-single';
                lineCommentStart = index;
                index += 3;
                continue;
            }
            inSingle = true;
            index++;
            continue;
        }
        if (char === '/' && next === '*') {
            blockComment = 'slash';
            lineCommentStart = index;
            index += 2;
            continue;
        }
        if (char === '/' && next === '/') {
            let previousIndex = index - 1;
            while (previousIndex >= 0 && /[ \t]/.test(text[previousIndex]!)) {
                previousIndex--;
            }
            const previous = previousIndex >= 0 ? text[previousIndex]! : '';
            if (previous !== ':' && previous !== '/') {
                inLineComment = true;
                lineCommentStart = index;
                index += 2;
                continue;
            }
            index += 2;
            continue;
        }
        if (char === '#') {
            inLineComment = true;
            lineCommentStart = index;
            index++;
            continue;
        }

        index++;
    }

    if (inLineComment && lineCommentStart >= 0) {
        spans.push({ start: lineCommentStart, end: text.length });
    }

    return spans;
}

export function parseCommentReferenceTarget(target: string): { path?: string; idea: string } | undefined {
    const trimmed = target.trim();
    const qualified = QUALIFIED_TARGET_PATTERN.exec(trimmed);
    if (qualified) {
        const path = JSON.parse(qualified[1]!) as string;
        const idea = qualified[3] ?? qualified[2]!;
        return { path, idea };
    }
    const local = LOCAL_TARGET_PATTERN.exec(trimmed);
    if (local) {
        return { idea: local[1]! };
    }
    return undefined;
}

function offsetToPosition(text: string, offset: number): Position {
    const before = text.slice(0, offset);
    const lines = before.split(/\r?\n/);
    return {
        line: lines.length - 1,
        character: lines[lines.length - 1]!.length
    };
}

export function findCommentReferencesInText(text: string, lineOffset = 0): EmbeddedCommentReference[] {
    const references: EmbeddedCommentReference[] = [];
    for (const span of findCommentSpansInText(text)) {
        const comment = text.slice(span.start, span.end);
        for (const match of comment.matchAll(COMMENT_REFERENCE_PATTERN)) {
            const parsed = parseCommentReferenceTarget(match[1]!);
            if (!parsed) {
                continue;
            }
            const start = span.start + (match.index ?? 0);
            const end = start + match[0].length;
            const startPos = offsetToPosition(text, start);
            const endPos = offsetToPosition(text, end);
            references.push({
                ...parsed,
                range: {
                    start: { line: lineOffset + startPos.line, character: startPos.character },
                    end: { line: lineOffset + endPos.line, character: endPos.character }
                }
            });
        }
    }
    return references;
}

export function findCommentReferenceAt(
    document: LangiumDocument,
    position: Position
): EmbeddedCommentReference | undefined {
    const offset = document.textDocument.offsetAt(position);
    return findCommentReferencesInText(document.textDocument.getText())
        .find(reference => {
            const start = document.textDocument.offsetAt(reference.range.start);
            const end = document.textDocument.offsetAt(reference.range.end);
            return offset >= start && offset <= end;
        });
}

export function findCommentReferencePartAt(
    document: LangiumDocument,
    position: Position
): { reference: EmbeddedCommentReference; property: 'path' | 'idea' } | undefined {
    const reference = findCommentReferenceAt(document, position);
    if (!reference) {
        return undefined;
    }
    const lineText = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
    });
    const bracketMatch = /rq:\s*\[([^\]]+)\]/.exec(lineText);
    if (!bracketMatch || bracketMatch.index === undefined) {
        return { reference, property: 'idea' };
    }
    const bracketStart = bracketMatch.index + bracketMatch[0].indexOf('[') + 1;
    const target = bracketMatch[1]!;
    const qualified = QUALIFIED_TARGET_PATTERN.exec(target.trim());
    if (qualified && reference.path) {
        const pathInLine = bracketStart + target.indexOf(qualified[1]!);
        const pathEnd = pathInLine + qualified[1]!.length;
        if (position.character >= pathInLine && position.character <= pathEnd) {
            return { reference, property: 'path' };
        }
        const ideaToken = qualified[3] ?? qualified[2]!;
        const ideaInLine = bracketStart + target.lastIndexOf(ideaToken);
        const ideaEnd = ideaInLine + ideaToken.length;
        if (position.character >= ideaInLine && position.character < ideaEnd) {
            return { reference, property: 'idea' };
        }
    } else {
        const local = LOCAL_TARGET_PATTERN.exec(target.trim());
        if (local) {
            const ideaStart = bracketStart + target.indexOf(local[1]!);
            const ideaEnd = ideaStart + local[1]!.length;
            if (position.character >= ideaStart && position.character < ideaEnd) {
                return { reference, property: 'idea' };
            }
        }
    }
    return { reference, property: 'idea' };
}

export function resolveCommentReferenceIdea(
    reference: EmbeddedCommentReference,
    document: LangiumDocument,
    documents: LangiumDocuments
) {
    if (reference.path) {
        const imported = findImportedDocument(reference.path, document, documents);
        const model = imported?.parseResult.value;
        if (!imported || !isModel(model)) {
            return undefined;
        }
        return model.elements.find(
            element => (isIdea(element) || isOneLinerIdea(element)) && element.name === reference.idea
        );
    }
    for (const candidate of documents.all) {
        const model = candidate.parseResult.value;
        if (!isModel(model)) {
            continue;
        }
        const idea = model.elements.find(
            element => (isIdea(element) || isOneLinerIdea(element)) && element.name === reference.idea
        );
        if (idea) {
            return idea;
        }
    }
    return undefined;
}

export function resolveCommentDefinitionLinks(
    reference: EmbeddedCommentReference,
    document: LangiumDocument,
    documents: LangiumDocuments
): LocationLink[] | undefined {
    const idea = resolveCommentReferenceIdea(reference, document, documents);
    const ideaNode = idea?.$cstNode;
    const targetDocument = idea ? documents.getDocument(AstUtils.getDocument(idea).uri) : undefined;
    if (!ideaNode || !targetDocument) {
        return undefined;
    }
    return [LocationLink.create(
        targetDocument.textDocument.uri,
        ideaNode.range,
        ideaNode.range,
        reference.range
    )];
}

export function resolveFileUri(path: string, document: LangiumDocument) {
    return UriUtils.resolvePath(UriUtils.dirname(document.uri), path);
}

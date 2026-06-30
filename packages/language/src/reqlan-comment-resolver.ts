/**
 * Locates and parses rq:"path".idea references embedded in line comments.
 */
import type { LangiumDocument, LangiumDocuments } from 'langium';
import { UriUtils } from 'langium';
import type { Position, Range } from 'vscode-languageserver';
import { findImportedDocument } from './reqlan-imports.js';
import { isIdea, isModel, isOneLinerIdea } from './generated/ast.js';

export interface EmbeddedCommentReference {
    path: string;
    idea: string;
    range: Range;
}

const COMMENT_REFERENCE_PATTERN = /rq:\s*("(?:\\.|[^"\\])*")\s*\.\s*([_a-zA-Z][\w_]*)/g;

export function findCommentReferencesInText(text: string, lineOffset = 0): EmbeddedCommentReference[] {
    const references: EmbeddedCommentReference[] = [];
    const lines = text.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const commentIndex = line.indexOf('//');
        const hashIndex = line.indexOf('#');
        const commentStart = commentIndex >= 0 && hashIndex >= 0
            ? Math.min(commentIndex, hashIndex)
            : commentIndex >= 0
                ? commentIndex
                : hashIndex;
        if (commentStart < 0) {
            continue;
        }
        const comment = line.slice(commentStart);
        for (const match of comment.matchAll(COMMENT_REFERENCE_PATTERN)) {
            const path = JSON.parse(match[1]) as string;
            const idea = match[2];
            const start = commentStart + (match.index ?? 0);
            references.push({
                path,
                idea,
                range: {
                    start: { line: lineOffset + lineIndex, character: start },
                    end: { line: lineOffset + lineIndex, character: start + match[0].length }
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
    const pathMatch = /rq:\s*("(?:\\.|[^"\\])*")/.exec(lineText);
    if (pathMatch && pathMatch.index !== undefined) {
        const pathStart = pathMatch.index + pathMatch[0].indexOf(pathMatch[1]);
        const pathEnd = pathStart + pathMatch[1].length;
        if (position.character >= pathStart && position.character <= pathEnd) {
            return { reference, property: 'path' };
        }
    }
    const ideaMatch = /\.\s*([_a-zA-Z][\w_]*)/.exec(lineText.slice(reference.range.start.character));
    if (ideaMatch && ideaMatch.index !== undefined) {
        const ideaStart = reference.range.start.character + ideaMatch.index + ideaMatch[0].indexOf(ideaMatch[1]);
        const ideaEnd = ideaStart + ideaMatch[1].length;
        if (position.character >= ideaStart && position.character < ideaEnd) {
            return { reference, property: 'idea' };
        }
    }
    return { reference, property: 'idea' };
}

export function resolveCommentReferenceIdea(
    reference: EmbeddedCommentReference,
    document: LangiumDocument,
    documents: LangiumDocuments
) {
    const imported = findImportedDocument(reference.path, document, documents);
    const model = imported?.parseResult.value;
    if (!imported || !isModel(model)) {
        return undefined;
    }
    return model.elements.find(
        element => (isIdea(element) || isOneLinerIdea(element)) && element.name === reference.idea
    );
}

export function resolveFileUri(path: string, document: LangiumDocument) {
    return UriUtils.resolvePath(UriUtils.dirname(document.uri), path);
}

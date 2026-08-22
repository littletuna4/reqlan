/**
 * Plan workspace edits for moving or deleting idea declarations and their references.
 * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
 * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_delete]
 * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_changes]
 * rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
 */
import { AstUtils, URI, type AstNode, type LangiumDocument, type ReferenceDescription } from 'langium';
import type { Range, TextEdit } from 'vscode-languageserver';
import {
    isIdea,
    isModel,
    isOneLinerIdea,
    type Idea,
    type Model,
    type OneLinerIdea
} from './generated/ast.js';
import { buildInboundPathRewriteEdits } from './file-path-rewrite.js';
import {
    buildFromImportEdit,
    buildNamespaceImportEdit,
    fileBasenameAlias,
    findImportInsertPosition,
    namespaceAliasForPath,
    relativeRqImportPath
} from './reqlan-import-edits.js';
import {
    collectUsedBindingNames,
    planDestRequiredImportEdits,
    planUnusedImportEdits,
    positionsEqual,
    sourceBoundNames,
    uniqueImportAlias
} from './reqlan-idea-move-imports.js';
import { findCommentPathReferencesInText } from './reqlan-path-references.js';

export type RefactorIdeaDeclaration = Idea | OneLinerIdea;

export interface DocumentTextEdits {
    uri: string;
    edits: TextEdit[];
}

export function isRefactorIdeaDeclaration(node: AstNode): node is RefactorIdeaDeclaration {
    return isIdea(node) || isOneLinerIdea(node);
}

export function ideaDeclarationText(document: LangiumDocument, idea: RefactorIdeaDeclaration): string | undefined {
    const range = idea.$cstNode?.range;
    if (!range) {
        return undefined;
    }
    return document.textDocument.getText(range);
}

export function planIdeaDeleteEdits(
    idea: RefactorIdeaDeclaration,
    references: readonly ReferenceDescription[],
    documentsText?: Map<string, string>
): DocumentTextEdits[] {
    const byUri = new Map<string, TextEdit[]>();
    const declarationDoc = AstUtils.getDocument(idea);
    const declarationUri = declarationDoc.uri.toString();
    const declarationRange = expandDeclarationRange(idea);
    if (declarationRange) {
        pushEdit(byUri, declarationUri, { range: declarationRange, newText: '' });
    }

    for (const reference of references) {
        const uri = reference.sourceUri.toString();
        if (uri === declarationUri && rangesOverlap(reference.segment.range, declarationRange)) {
            continue;
        }
        const clearRange = expandReferenceClearRange(
            documentsText?.get(uri),
            reference.segment.range
        );
        pushEdit(byUri, uri, { range: clearRange, newText: '' });
    }

    if (documentsText) {
        for (const [uri, text] of documentsText) {
            for (const edit of planCommentReferenceRemovals(text, idea.name)) {
                pushEdit(byUri, uri, edit);
            }
        }
    }

    return toDocumentEdits(byUri);
}

export interface PlanIdeaMoveInput {
    idea: RefactorIdeaDeclaration;
    sourceDocument: LangiumDocument;
    destinationDocument: LangiumDocument;
    references: readonly ReferenceDescription[];
    /** Extra file texts (code or `.rq`) that may hold qualified comment idea links. */
    documentsText?: Map<string, string>;
    /**
     * Leave a one-liner stub in the source that refers to the moved idea, and always
     * import the destination file. Used by "Move idea content".
     */
    leaveSourceStub?: boolean;
}

export function planIdeaMoveEdits(input: PlanIdeaMoveInput): DocumentTextEdits[] {
    const ideaText = ideaDeclarationText(input.sourceDocument, input.idea);
    if (!ideaText) {
        return [];
    }

    const byUri = new Map<string, TextEdit[]>();
    const sourceUri = input.sourceDocument.uri.toString();
    const destUri = input.destinationDocument.uri.toString();
    const declarationRange = expandDeclarationRange(input.idea);
    const sourceModel = input.sourceDocument.parseResult.value;
    const destModel = input.destinationDocument.parseResult.value;
    const destImportPath = relativeRqImportPath(input.sourceDocument.uri, input.destinationDocument.uri);
    const existingDestAlias = isModel(sourceModel)
        ? namespaceAliasForPath(sourceModel, destImportPath)
        : undefined;
    const stubAlias = input.leaveSourceStub && isModel(sourceModel)
        ? (existingDestAlias ?? uniqueImportAlias(
            fileBasenameAlias(input.destinationDocument.uri),
            sourceBoundNames(sourceModel)
        ))
        : undefined;

    if (declarationRange) {
        const stubText = stubAlias
            ? `${input.idea.name} [${stubAlias}.${input.idea.name}]\n`
            : '';
        pushEdit(byUri, sourceUri, { range: declarationRange, newText: stubText });
    }

    if (isModel(sourceModel)) {
        const usedAfterMove = collectUsedBindingNames(sourceModel, input.idea);
        if (stubAlias) {
            usedAfterMove.add(stubAlias);
        }
        for (const edit of planUnusedImportEdits(input.sourceDocument, usedAfterMove)) {
            pushEdit(byUri, sourceUri, edit);
        }
    }

    const destImportEdits = planDestRequiredImportEdits({
        idea: input.idea,
        sourceDocument: input.sourceDocument,
        destinationDocument: input.destinationDocument
    });
    const ideaInsert = isModel(destModel) ? findIdeaInsertPosition(destModel) : undefined;
    let insertedIdea = false;
    if (ideaInsert) {
        for (const edit of destImportEdits) {
            if (
                positionsEqual(edit.range.start, ideaInsert)
                && positionsEqual(edit.range.end, ideaInsert)
            ) {
                edit.newText = `${edit.newText}${ideaText}\n`;
                insertedIdea = true;
                break;
            }
        }
        if (!insertedIdea) {
            pushEdit(byUri, destUri, {
                range: { start: ideaInsert, end: ideaInsert },
                newText: `${ideaText}\n`
            });
        }
    }
    for (const edit of destImportEdits) {
        pushEdit(byUri, destUri, edit);
    }

    if (stubAlias) {
        if (!existingDestAlias) {
            const nsEdit = buildNamespaceImportEdit(input.sourceDocument, destImportPath, stubAlias);
            if (nsEdit) {
                pushEdit(byUri, sourceUri, nsEdit);
            }
        }
    } else if (sourceKeepsReferences(input.references, sourceUri, declarationRange)) {
        const importEdit = buildFromImportEdit(input.sourceDocument, destImportPath, input.idea.name);
        if (importEdit) {
            pushEdit(byUri, sourceUri, importEdit);
        }
    }

    if (input.documentsText) {
        for (const [uri, text] of input.documentsText) {
            for (const edit of planCommentPathRewritesForMovedIdea(
                text,
                uri,
                input.sourceDocument.uri,
                input.destinationDocument.uri,
                input.idea.name
            )) {
                pushEdit(byUri, uri, edit);
            }
        }
    }

    return toDocumentEdits(byUri);
}

export function findIdeaDeclarationAtRange(
    document: LangiumDocument,
    range: Range
): RefactorIdeaDeclaration | undefined {
    const offset = document.textDocument.offsetAt(range.start);
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
        if (!isRefactorIdeaDeclaration(node) || !node.$cstNode) {
            continue;
        }
        const start = document.textDocument.offsetAt(node.$cstNode.range.start);
        const end = document.textDocument.offsetAt(node.$cstNode.range.end);
        if (offset >= start && offset <= end) {
            return node;
        }
        if (
            range.start.line === node.$cstNode.range.start.line
            && range.start.character <= (node.name?.length ?? 0) + 1
        ) {
            return node;
        }
    }
    return undefined;
}

export function listRefactorIdeaDeclarations(document: LangiumDocument): RefactorIdeaDeclaration[] {
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return [];
    }
    return model.elements.filter(isRefactorIdeaDeclaration);
}

function planCommentPathRewritesForMovedIdea(
    text: string,
    referencingUri: string,
    oldTargetUri: URI,
    newTargetUri: URI,
    ideaName: string
): TextEdit[] {
    const refs = findCommentPathReferencesInText(text).filter(reference => reference.idea === ideaName);
    return buildInboundPathRewriteEdits(
        refs,
        URI.parse(referencingUri),
        oldTargetUri,
        newTargetUri,
        (_path, newPath) => JSON.stringify(newPath)
    );
}

function sourceKeepsReferences(
    references: readonly ReferenceDescription[],
    sourceUri: string,
    declarationRange: Range | undefined
): boolean {
    return references.some(reference =>
        reference.sourceUri.toString() === sourceUri
        && !rangesOverlap(reference.segment.range, declarationRange)
    );
}

function findIdeaInsertPosition(model: Model): { line: number; character: number } {
    const lastElement = model.elements[model.elements.length - 1];
    if (lastElement?.$cstNode) {
        const end = lastElement.$cstNode.range.end;
        return { line: end.line + 1, character: 0 };
    }
    return findImportInsertPosition(model).position;
}

function expandDeclarationRange(idea: RefactorIdeaDeclaration): Range | undefined {
    const range = idea.$cstNode?.range;
    if (!range) {
        return undefined;
    }
    return {
        start: { line: range.start.line, character: 0 },
        end: { line: range.end.line + 1, character: 0 }
    };
}

function expandReferenceClearRange(text: string | undefined, range: Range): Range {
    if (!text) {
        return range;
    }
    const line = text.split(/\r?\n/)[range.start.line] ?? '';
    const before = line.slice(0, range.start.character);
    const after = line.slice(range.end.character);
    const wikiOpen = before.endsWith('[[') ? 2 : before.endsWith('[') ? 1 : 0;
    const wikiClose = after.startsWith(']]') ? 2 : after.startsWith(']') ? 1 : 0;
    if (wikiOpen > 0 && wikiClose > 0) {
        return {
            start: { line: range.start.line, character: range.start.character - wikiOpen },
            end: { line: range.end.line, character: range.end.character + wikiClose }
        };
    }
    return range;
}

function planCommentReferenceRemovals(text: string, ideaName: string): TextEdit[] {
    const edits: TextEdit[] = [];
    const pattern = /rq:\s*\[[^\]]*\]/g;
    for (const match of text.matchAll(pattern)) {
        const body = match[0]!;
        if (!new RegExp(`(\\.|\\[)${escapeRegExp(ideaName)}(\\]|$)`).test(body)) {
            continue;
        }
        const start = offsetToPosition(text, match.index ?? 0);
        const end = offsetToPosition(text, (match.index ?? 0) + body.length);
        edits.push({ range: { start, end }, newText: '' });
    }
    return edits;
}

function pushEdit(map: Map<string, TextEdit[]>, uri: string, edit: TextEdit): void {
    const list = map.get(uri) ?? [];
    list.push(edit);
    map.set(uri, list);
}

function toDocumentEdits(byUri: Map<string, TextEdit[]>): DocumentTextEdits[] {
    return [...byUri.entries()].map(([uri, edits]) => ({
        uri,
        edits: [...edits].sort((left, right) => {
            if (left.range.start.line !== right.range.start.line) {
                return right.range.start.line - left.range.start.line;
            }
            return right.range.start.character - left.range.start.character;
        })
    }));
}

function rangesOverlap(left: Range, right: Range | undefined): boolean {
    if (!right) {
        return false;
    }
    const leftStart = left.start.line * 1e9 + left.start.character;
    const leftEnd = left.end.line * 1e9 + left.end.character;
    const rightStart = right.start.line * 1e9 + right.start.character;
    const rightEnd = right.end.line * 1e9 + right.end.character;
    return leftStart < rightEnd && rightStart < leftEnd;
}

function offsetToPosition(text: string, offset: number): { line: number; character: number } {
    const before = text.slice(0, offset);
    const lines = before.split(/\r?\n/);
    return {
        line: lines.length - 1,
        character: lines[lines.length - 1]!.length
    };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

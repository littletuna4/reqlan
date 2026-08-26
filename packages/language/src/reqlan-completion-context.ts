/**
 * Detects where completion was requested in a reqlan document.
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
 */
import type { CstNode, LangiumDocument } from 'langium';
import { CstUtils, GrammarUtils } from 'langium';
import type { Position } from 'vscode-languageserver';
import {
    isAttribute,
    isBracketReference,
    isFileReference,
    isFileSymbolReference,
    isIdea,
    isImport,
    isMarkdownLink,
    isModel,
    isOneLinerIdea,
    isQualifiedReference,
    isWikiLink,
    type Attribute,
    type IdeaDeclaration
} from './generated/ast.js';
import {
    isMarkdownLinkLabelPosition,
    linePrefixBeforeMarkdownLinkTarget
} from './reqlan-markdown-links.js';

export type CompletionSite =
    | 'main_description'
    | 'attribute_key'
    | 'attribute_value'
    | 'reference'
    | 'anonymous_import_path'
    | 'qualified_file_idea'
    | 'default';

export interface AttributeKeyContext {
    prefix: string;
    replaceStart: Position;
    replaceEnd: Position;
}

export interface AttributeValueContext {
    attributeName: string;
    prefix: string;
    replaceStart: Position;
    replaceEnd: Position;
}

export interface ReferencePrefixContext {
    prefix: string;
    replaceStart: Position;
    replaceEnd: Position;
}

export interface AnonymousImportPathContext {
    prefix: string;
    delimiter: '"' | "'";
    replaceStart: Position;
    replaceEnd: Position;
}

export interface QualifiedFileIdeaContext {
    path: string;
    ideaPrefix: string;
    replaceStart: Position;
    replaceEnd: Position;
}

export function getCompletionSite(document: LangiumDocument, position: Position): CompletionSite {
    if (getAttributeKeyContext(document, position)) {
        return 'attribute_key';
    }
    if (getAttributeValueContext(document, position)) {
        return 'attribute_value';
    }
    if (getAnonymousImportPathContext(document, position)) {
        return 'anonymous_import_path';
    }
    if (getQualifiedFileIdeaContext(document, position)) {
        return 'qualified_file_idea';
    }
    if (getReferencePrefixContext(document, position)) {
        return 'reference';
    }
    if (isInMainDescriptionProse(document, position)) {
        return 'main_description';
    }
    return 'default';
}

/**
 * Quoted path inside a bracket reference, e.g. `["@/…` or `['./foo`.
 * Text-based so incomplete/unclosed strings still complete like import paths.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".anonymous_reference_code_completion]
 */
export function getAnonymousImportPathContext(
    document: LangiumDocument,
    position: Position
): AnonymousImportPathContext | undefined {
    if (isMarkdownLinkLabelPosition(document, position) || linePrefixBeforeMarkdownLinkTarget(document, position)) {
        return undefined;
    }
    const line = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: position.character }
    });
    const match = /(?:^|[^[])\[{1,2}(["'])([^"']*)$/.exec(line);
    if (!match) {
        return undefined;
    }
    const delimiter = match[1] as '"' | "'";
    const prefix = match[2] ?? '';
    return {
        prefix,
        delimiter,
        replaceStart: { line: position.line, character: position.character - prefix.length },
        replaceEnd: position
    };
}

/**
 * Idea / ideaset name after a quoted file path, e.g. `["./lib.rq".` or `["./lib.rq".expor`.
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
 */
export function getQualifiedFileIdeaContext(
    document: LangiumDocument,
    position: Position
): QualifiedFileIdeaContext | undefined {
    if (isMarkdownLinkLabelPosition(document, position) || linePrefixBeforeMarkdownLinkTarget(document, position)) {
        return undefined;
    }
    const line = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: position.character }
    });
    const match = /(?:^|[^[])\[{1,2}(["'])([^"']*)\1\.([\w_.]*)$/.exec(line);
    if (!match) {
        return undefined;
    }
    const ideaPrefix = match[3] ?? '';
    return {
        path: match[2] ?? '',
        ideaPrefix,
        replaceStart: { line: position.line, character: position.character - ideaPrefix.length },
        replaceEnd: position
    };
}

export function getAttributeKeyContext(
    document: LangiumDocument,
    position: Position
): AttributeKeyContext | undefined {
    const line = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: position.character }
    });
    const match = line.match(/^\s*@([\w_]*)$/);
    if (!match) {
        return undefined;
    }
    const prefix = match[1] ?? '';
    const atIndex = line.indexOf('@');
    return {
        prefix,
        replaceStart: { line: position.line, character: atIndex + 1 },
        replaceEnd: position
    };
}

export function getReferencePrefixContext(
    document: LangiumDocument,
    position: Position
): ReferencePrefixContext | undefined {
    if (isMarkdownLinkLabelPosition(document, position) || linePrefixBeforeMarkdownLinkTarget(document, position)) {
        return undefined;
    }
    const line = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: position.character }
    });
    const bracketMatch = line.match(/\[[\w_.]*$/);
    if (bracketMatch) {
        const prefix = bracketMatch[0].slice(1);
        return {
            prefix,
            replaceStart: { line: position.line, character: position.character - prefix.length },
            replaceEnd: position
        };
    }
    const wikiMatch = line.match(/\[\[[\w_.]*$/);
    if (wikiMatch) {
        const prefix = wikiMatch[0].slice(2);
        return {
            prefix,
            replaceStart: { line: position.line, character: position.character - prefix.length },
            replaceEnd: position
        };
    }
    return undefined;
}

export function getAttributeValueContext(
    document: LangiumDocument,
    position: Position
): AttributeValueContext | undefined {
    const linePrefix = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: position
    });
    const inlineMatch = linePrefix.match(/^\s*@([\w_]+)(?:\s*:\s*|\s+)(\S*)$/);
    if (inlineMatch) {
        const attributeName = inlineMatch[1]!;
        const prefix = inlineMatch[2] ?? '';
        const valueStart = linePrefix.length - prefix.length;
        const attribute = findAttributeAtPosition(document, position);
        if (attribute?.value && isProseAttributeValue(attribute)) {
            return undefined;
        }
        return {
            attributeName,
            prefix,
            replaceStart: { line: position.line, character: valueStart },
            replaceEnd: position
        };
    }
    const attribute = findAttributeAtPosition(document, position);
    if (!attribute || !attribute.value || isProseAttributeValue(attribute)) {
        return undefined;
    }
    const listMatch = linePrefix.match(/^\s+(\S*)$/);
    if (listMatch && attribute.value.$type === 'ListValue') {
        const valueStart = linePrefix.search(/\S/);
        if (valueStart >= 0) {
            return {
                attributeName: attribute.name,
                prefix: listMatch[1] ?? '',
                replaceStart: { line: position.line, character: valueStart },
                replaceEnd: position
            };
        }
    }
    return undefined;
}

export function isInMainDescriptionProse(document: LangiumDocument, position: Position): boolean {
    if (
        getAnonymousImportPathContext(document, position)
        || getQualifiedFileIdeaContext(document, position)
        || getReferencePrefixContext(document, position)
    ) {
        return false;
    }
    const linePrefix = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: position
    });
    if (/^\s*@/.test(linePrefix)) {
        return false;
    }
    if (isInsideReferencePartAtPosition(document, position)) {
        return false;
    }
    return findContainingIdea(document, position) !== undefined;
}

export function isImportPathCompletion(contextProperty: string | undefined, container: unknown): boolean {
    return contextProperty === 'path' && isImport(container);
}

export function isFilePathCompletion(contextProperty: string | undefined, container: unknown): boolean {
    return contextProperty === 'file' && (isFileReference(container) || isFileSymbolReference(container));
}

/**
 * Innermost idea / one-liner whose range covers `position` (for completion ranking).
 * Ideas are top-level declarations, so this is O(declarations) rather than a full AST walk.
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
 */
export function findContainingIdea(
    document: LangiumDocument,
    position: Position
): IdeaDeclaration | undefined {
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return undefined;
    }
    let match: IdeaDeclaration | undefined;
    for (const element of model.elements) {
        if ((!isIdea(element) && !isOneLinerIdea(element)) || !element.$cstNode?.range) {
            continue;
        }
        const range = element.$cstNode.range;
        if (position.line >= range.start.line && position.line <= range.end.line) {
            match = element;
        }
    }
    return match;
}

function findAttributeAtPosition(document: LangiumDocument, position: Position): Attribute | undefined {
    const root = document.parseResult.value.$cstNode;
    if (!root) {
        return undefined;
    }
    const offset = document.textDocument.offsetAt(position);
    let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
    while (current) {
        if (isAttribute(current.astNode)) {
            return current.astNode;
        }
        current = current.container;
    }
    return undefined;
}

function isProseAttributeValue(attribute: Attribute): boolean {
    if (!attribute.value) {
        return false;
    }
    return attribute.value.$type === 'BlockValue';
}

function isInsideReferencePartAtPosition(document: LangiumDocument, position: Position): boolean {
    const root = document.parseResult.value.$cstNode;
    if (!root) {
        return false;
    }
    const offset = document.textDocument.offsetAt(position);
    const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
    return leaf ? isInsideReferencePart(leaf) : false;
}

function isInsideReferencePart(leaf: CstNode): boolean {
    let current: CstNode | undefined = leaf;
    while (current) {
        if (
            isMarkdownLink(current.astNode)
            || isBracketReference(current.astNode)
            || isWikiLink(current.astNode)
            || isFileReference(current.astNode)
            || isFileSymbolReference(current.astNode)
            || isQualifiedReference(current.astNode)
        ) {
            return true;
        }
        current = current.container;
    }
    return false;
}

export function assignmentFeatureAt(document: LangiumDocument, position: Position): string | undefined {
    const root = document.parseResult.value.$cstNode;
    if (!root) {
        return undefined;
    }
    const offset = document.textDocument.offsetAt(position);
    let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
    while (current) {
        const assignment = GrammarUtils.findAssignment(current);
        if (assignment) {
            return assignment.feature;
        }
        current = current.container;
    }
    return undefined;
}

export function containerAstNodeAt(document: LangiumDocument, position: Position): unknown {
    const root = document.parseResult.value.$cstNode;
    if (!root) {
        return undefined;
    }
    const offset = document.textDocument.offsetAt(position);
    let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
    while (current) {
        if (current.astNode && current.astNode !== document.parseResult.value) {
            return current.astNode;
        }
        current = current.container;
    }
    return undefined;
}

/**
 * Detects where completion was requested in a reqlan document.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".completion_site_identifier_charset]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_reentry_is_lossless]
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
    isListValue,
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

/**
 * Identifier charset mirrored from the grammar `ID` terminal `[_a-zA-Z][\w-]*`.
 * Site regexes must not be narrower than this; the hyphen is a legal identifier character.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".completion_site_identifier_charset]
 */
const ID_START_CHARS = 'A-Za-z_';
const ID_CONTINUATION_CHARS = '\\w-';

const ATTRIBUTE_KEY_LINE = new RegExp(`^\\s*@([${ID_CONTINUATION_CHARS}]*)$`);
const REFERENCE_PREFIX_LINE = new RegExp(`\\[[.${ID_CONTINUATION_CHARS}]*$`);
const WIKI_LINK_PREFIX_LINE = new RegExp(`\\[\\[[.${ID_CONTINUATION_CHARS}]*$`);
const QUALIFIED_FILE_IDEA_LINE = new RegExp(
    `(?:^|[^[])\\[{1,2}(["'])([^"']*)\\1\\.[.${ID_CONTINUATION_CHARS}]*$`
);
const ATTRIBUTE_VALUE_LINE = new RegExp(
    `^\\s*@([${ID_START_CHARS}][${ID_CONTINUATION_CHARS}]*)(?:\\s*:\\s*|\\s+)(\\S*)$`
);

/** Indented list-value line whose trailing token is under the cursor. */
const LIST_ITEM_LINE = /^\s+(\S*)$/;
/** Indented list-value line with a `-` item marker before the token under the cursor. */
const MARKED_LIST_ITEM_LINE = /^\s*-\s+(\S*)$/;

/** Rest of a token after the cursor, up to whitespace or end of line. */
const TOKEN_TAIL = /^\S*/;
/** Rest of an attribute key after the cursor; `:` also ends the key. */
const KEY_TAIL = /^[^\s:]*/;

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
    /** Key text after the cursor, up to whitespace, `:`, or end of line. */
    tail: string;
    replaceStart: Position;
    replaceEnd: Position;
}

export interface AttributeValueContext {
    attributeName: string;
    prefix: string;
    /** Value text after the cursor, up to whitespace or end of line. */
    tail: string;
    replaceStart: Position;
    replaceEnd: Position;
}

export interface ReferencePrefixContext {
    prefix: string;
    /** Line text after the cursor, up to the first closing `]`. Empty when none found. */
    tail: string;
    replaceStart: Position;
    replaceEnd: Position;
}

export interface AnonymousImportPathContext {
    prefix: string;
    delimiter: '"' | "'";
    /** Line text after the cursor, up to the matching closing quote. Empty when none found. */
    tail: string;
    /**
     * True when the string is unclosed and nothing but whitespace follows the line,
     * so completion can append the closing quote.
     * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_reentry_is_lossless]
     */
    closerMissing: boolean;
    replaceStart: Position;
    replaceEnd: Position;
}

export interface QualifiedFileIdeaContext {
    path: string;
    ideaPrefix: string;
    /** Line text after the cursor, up to the first closing `]`. Empty when none found. */
    tail: string;
    replaceStart: Position;
    replaceEnd: Position;
}

/**
 * Full line text at `position`, split at the cursor.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
 */
function lineAround(document: LangiumDocument, position: Position): { prefix: string; suffix: string } {
    const line = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
    });
    return { prefix: line.slice(0, position.character), suffix: line.slice(position.character) };
}

/** Line text after the cursor up to (not including) the first `closer`; empty when none. */
function tailBeforeCloser(suffix: string, closer: string): string {
    const index = suffix.indexOf(closer);
    return index < 0 ? '' : suffix.slice(0, index);
}

/**
 * Merge the label with the text left after the cursor, so the edit consumes the tail instead of duplicating it.
 * A folder insert keeps a bare file name: a tail with no `/` after a label that ends with `/` is the file being completed, so carry it.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
 */
export function mergeCompletionTail(label: string, prefix: string, tail: string): string {
    if (label.startsWith(prefix) && tail.startsWith(label.slice(prefix.length))) {
        return label + tail.slice(label.length - prefix.length);
    }
    if (label.endsWith('/') && tail.length > 0 && !tail.includes('/')) {
        return label + tail;
    }
    return label;
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
 * rq:["../../../reqlan rq/extension/language/support/features-imports.rq".anonymous_reference_code_completion]
 */
export function getAnonymousImportPathContext(
    document: LangiumDocument,
    position: Position
): AnonymousImportPathContext | undefined {
    if (isMarkdownLinkLabelPosition(document, position) || linePrefixBeforeMarkdownLinkTarget(document, position)) {
        return undefined;
    }
    const { prefix: linePrefix, suffix } = lineAround(document, position);
    const match = /(?:^|[^[])\[{1,2}(["'])([^"']*)$/.exec(linePrefix);
    if (!match) {
        return undefined;
    }
    const delimiter = match[1] as '"' | "'";
    const prefix = match[2] ?? '';
    const tail = tailBeforeCloser(suffix, delimiter);
    // No closer and only whitespace left: completion can close the string itself.
    const closerMissing = !suffix.includes(delimiter) && suffix.trim().length === 0;
    return {
        prefix,
        delimiter,
        tail,
        closerMissing,
        replaceStart: { line: position.line, character: position.character - prefix.length },
        replaceEnd: tail
            ? { line: position.line, character: position.character + tail.length }
            : position
    };
}

/**
 * Idea / ideaset name after a quoted file path, e.g. `["./lib.rq".` or `["./lib.rq".expor`.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
 */
export function getQualifiedFileIdeaContext(
    document: LangiumDocument,
    position: Position
): QualifiedFileIdeaContext | undefined {
    if (isMarkdownLinkLabelPosition(document, position) || linePrefixBeforeMarkdownLinkTarget(document, position)) {
        return undefined;
    }
    const { prefix: linePrefix, suffix } = lineAround(document, position);
    const match = QUALIFIED_FILE_IDEA_LINE.exec(linePrefix);
    if (!match) {
        return undefined;
    }
    const ideaPrefix = match[3] ?? '';
    const tail = tailBeforeCloser(suffix, ']');
    return {
        path: match[2] ?? '',
        ideaPrefix,
        tail,
        replaceStart: { line: position.line, character: position.character - ideaPrefix.length },
        replaceEnd: tail
            ? { line: position.line, character: position.character + tail.length }
            : position
    };
}

export function getAttributeKeyContext(
    document: LangiumDocument,
    position: Position
): AttributeKeyContext | undefined {
    const { prefix: linePrefix, suffix } = lineAround(document, position);
    const match = ATTRIBUTE_KEY_LINE.exec(linePrefix);
    if (!match) {
        return undefined;
    }
    const prefix = match[1] ?? '';
    const atIndex = linePrefix.indexOf('@');
    // The key word may continue past the cursor, so the edit reaches the token end.
    const tail = KEY_TAIL.exec(suffix)?.[0] ?? '';
    return {
        prefix,
        tail,
        replaceStart: { line: position.line, character: atIndex + 1 },
        replaceEnd: { line: position.line, character: position.character + tail.length }
    };
}

export function getReferencePrefixContext(
    document: LangiumDocument,
    position: Position
): ReferencePrefixContext | undefined {
    if (isMarkdownLinkLabelPosition(document, position) || linePrefixBeforeMarkdownLinkTarget(document, position)) {
        return undefined;
    }
    const { prefix: linePrefix, suffix } = lineAround(document, position);
    const tail = tailBeforeCloser(suffix, ']');
    const replaceEnd = tail
        ? { line: position.line, character: position.character + tail.length }
        : position;
    const bracketMatch = REFERENCE_PREFIX_LINE.exec(linePrefix);
    if (bracketMatch) {
        const prefix = bracketMatch[0].slice(1);
        return {
            prefix,
            tail,
            replaceStart: { line: position.line, character: position.character - prefix.length },
            replaceEnd
        };
    }
    const wikiMatch = WIKI_LINK_PREFIX_LINE.exec(linePrefix);
    if (wikiMatch) {
        const prefix = wikiMatch[0].slice(2);
        return {
            prefix,
            tail,
            replaceStart: { line: position.line, character: position.character - prefix.length },
            replaceEnd
        };
    }
    return undefined;
}

export function getAttributeValueContext(
    document: LangiumDocument,
    position: Position
): AttributeValueContext | undefined {
    const { prefix: linePrefix, suffix } = lineAround(document, position);
    const inlineMatch = ATTRIBUTE_VALUE_LINE.exec(linePrefix);
    if (inlineMatch) {
        const attributeName = inlineMatch[1]!;
        const prefix = inlineMatch[2] ?? '';
        const valueStart = linePrefix.length - prefix.length;
        const attribute = findAttributeAtPosition(document, position);
        if (attribute?.value && isProseAttributeValue(attribute)) {
            return undefined;
        }
        // The value token may continue past the cursor, so the edit reaches the token end.
        const tail = TOKEN_TAIL.exec(suffix)?.[0] ?? '';
        return {
            attributeName,
            prefix,
            tail,
            replaceStart: { line: position.line, character: valueStart },
            replaceEnd: { line: position.line, character: position.character + tail.length }
        };
    }
    const attribute = findAttributeAtPosition(document, position);
    if (!attribute || !attribute.value || isProseAttributeValue(attribute) || !isListValue(attribute.value)) {
        return undefined;
    }
    const token = listValueToken(linePrefix);
    if (!token) {
        return undefined;
    }
    const tail = TOKEN_TAIL.exec(suffix)?.[0] ?? '';
    return {
        attributeName: attribute.name,
        prefix: token.prefix,
        tail,
        replaceStart: { line: position.line, character: token.tokenStart },
        replaceEnd: { line: position.line, character: position.character + tail.length }
    };
}

/**
 * Value token under the cursor on a list-value continuation line.
 * Accepts a `-` item marker before the token, so list items that contain spaces still complete.
 * The replace range covers only the token.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
 */
function listValueToken(linePrefix: string): { prefix: string; tokenStart: number } | undefined {
    const match = LIST_ITEM_LINE.exec(linePrefix) ?? MARKED_LIST_ITEM_LINE.exec(linePrefix);
    if (!match) {
        return undefined;
    }
    const prefix = match[1] ?? '';
    return { prefix, tokenStart: linePrefix.length - prefix.length };
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
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
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

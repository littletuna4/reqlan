/**
 * Locate places where a selection or word can become a [reference],
 * and extract surrounding idea text for the search modal preview.
 * rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import type { LangiumDocument } from 'langium';
import type { Position, Range } from 'vscode-languageserver';
import {
    findContainingIdea,
    isInMainDescriptionProse
} from './reqlan-completion-context.js';
import {
    findIdeaReferenceAtPosition,
    type IdeaReferenceSite
} from './reqlan-idea-reference-site.js';
import { isIdea, isOneLinerIdea, type IdeaDeclaration } from './generated/ast.js';

/** Custom LSP request: resolve search/wrap site at a range (no command-arg cache). */
export const REQLAN_REFERENCE_SEARCH_SITE_REQUEST = 'reqlan/referenceSearchSite';

export type ReferenceSearchMode = 'replace' | 'wrap';

export interface ReferenceSearchContext {
    ideaName: string;
    /** Text before the target within the idea source. */
    before: string;
    /** Selected / reference text that will become (or already is) the reference. */
    target: string;
    /** Text after the target within the idea source. */
    after: string;
}

export interface ReferenceSearchSite {
    refText: string;
    range: Range;
    mode: ReferenceSearchMode;
    kind: 'bracket' | 'wikilink' | 'prose';
    context?: ReferenceSearchContext;
}

/** Result of {@link REQLAN_REFERENCE_SEARCH_SITE_REQUEST} / extension command payload. */
export interface ReferenceSearchSiteRequestResult {
    documentUri: string;
    refText: string;
    range: Range;
    mode: ReferenceSearchMode;
    context?: ReferenceSearchContext;
}

export function toReferenceSearchCommandArgs(
    documentUri: string,
    site: ReferenceSearchSite
): ReferenceSearchSiteRequestResult {
    return {
        documentUri,
        refText: site.refText,
        range: site.range,
        mode: site.mode,
        context: site.context
    };
}

/**
 * Prefer an existing [reference]/[[wikilink]] under the cursor; otherwise a
 * selection or word in idea-body prose that can be wrapped as `[name]`.
 */
export function findReferenceSearchSite(
    document: LangiumDocument,
    range: Range
): ReferenceSearchSite | undefined {
    const existing = findIdeaReferenceAtPosition(document, range.start);
    if (existing) {
        return siteFromExistingReference(document, existing);
    }
    return findWrapSite(document, range);
}

function siteFromExistingReference(
    document: LangiumDocument,
    existing: IdeaReferenceSite
): ReferenceSearchSite {
    return {
        refText: existing.refText,
        range: existing.range,
        mode: 'replace',
        kind: existing.kind,
        context: buildContextForRange(document, existing.range)
    };
}

function findWrapSite(document: LangiumDocument, range: Range): ReferenceSearchSite | undefined {
    const rawRange = isEmptyRange(range)
        ? expandToWordAtPosition(document, range.start)
        : normalizeForwardRange(range);
    const wrapRange = rawRange ? trimRangeWhitespace(document, rawRange) : undefined;
    if (!wrapRange || isEmptyRange(wrapRange)) {
        return undefined;
    }

    // Both ends must sit in idea-body prose (not imports, attribute keys, refs, etc.)
    const endProbe = document.textDocument.positionAt(
        Math.max(
            document.textDocument.offsetAt(wrapRange.start),
            document.textDocument.offsetAt(wrapRange.end) - 1
        )
    );
    if (!isAppropriateWrapLocation(document, wrapRange.start)
        || !isAppropriateWrapLocation(document, endProbe)) {
        return undefined;
    }

    // Keep wrap inside a single idea
    const idea = findContainingIdea(document, wrapRange.start);
    if (!idea || findContainingIdea(document, wrapRange.end) !== idea) {
        return undefined;
    }

    const refText = document.textDocument.getText(wrapRange).trim();
    if (!refText || /\n/.test(refText)) {
        return undefined;
    }
    // Avoid wrapping text that is already bracket-wrapped
    if (/^\[.*\]$/.test(refText) || /^\[\[.*\]\]$/.test(refText)) {
        return undefined;
    }

    return {
        refText,
        range: wrapRange,
        mode: 'wrap',
        kind: 'prose',
        context: buildContextForRange(document, wrapRange, idea)
    };
}

export function isAppropriateWrapLocation(document: LangiumDocument, position: Position): boolean {
    return isInMainDescriptionProse(document, position);
}

export function buildContextForRange(
    document: LangiumDocument,
    range: Range,
    idea?: IdeaDeclaration
): ReferenceSearchContext | undefined {
    const containing = idea ?? findContainingIdea(document, range.start);
    if (!containing?.$cstNode) {
        return undefined;
    }
    const ideaRange = containing.$cstNode.range;
    const ideaText = document.textDocument.getText(ideaRange);
    const ideaStart = document.textDocument.offsetAt(ideaRange.start);
    const targetStart = document.textDocument.offsetAt(range.start) - ideaStart;
    const targetEnd = document.textDocument.offsetAt(range.end) - ideaStart;
    if (targetStart < 0 || targetEnd > ideaText.length || targetStart > targetEnd) {
        return undefined;
    }
    return {
        ideaName: containing.name,
        before: ideaText.slice(0, targetStart),
        target: ideaText.slice(targetStart, targetEnd),
        after: ideaText.slice(targetEnd)
    };
}

export function expandToWordAtPosition(
    document: LangiumDocument,
    position: Position
): Range | undefined {
    const line = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 }
    });
    // Strip trailing newline for indexing
    const lineText = line.replace(/\r?\n$/, '');
    if (position.character > lineText.length) {
        return undefined;
    }
    const isWord = (ch: string | undefined) => !!ch && /[A-Za-z0-9_]/.test(ch);
    let start = position.character;
    let end = position.character;
    while (start > 0 && isWord(lineText[start - 1])) {
        start -= 1;
    }
    while (end < lineText.length && isWord(lineText[end])) {
        end += 1;
    }
    if (start === end) {
        return undefined;
    }
    return {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end }
    };
}

function trimRangeWhitespace(document: LangiumDocument, range: Range): Range | undefined {
    const text = document.textDocument.getText(range);
    const lead = /^\s*/.exec(text)?.[0].length ?? 0;
    const trail = /\s*$/.exec(text)?.[0].length ?? 0;
    if (lead + trail >= text.length) {
        return undefined;
    }
    const startOffset = document.textDocument.offsetAt(range.start) + lead;
    const endOffset = document.textDocument.offsetAt(range.end) - trail;
    return {
        start: document.textDocument.positionAt(startOffset),
        end: document.textDocument.positionAt(endOffset)
    };
}

function isEmptyRange(range: Range): boolean {
    return range.start.line === range.end.line && range.start.character === range.end.character;
}

function normalizeForwardRange(range: Range): Range {
    if (
        range.start.line > range.end.line
        || (range.start.line === range.end.line && range.start.character > range.end.character)
    ) {
        return { start: range.end, end: range.start };
    }
    return range;
}

export function isBlockOrOneLinerIdea(node: unknown): node is IdeaDeclaration {
    return isIdea(node) || isOneLinerIdea(node);
}

/**
 * Custom token builder so line/block comments do not match inside string literals
 * or complete backtick fences, empty slash-star-star-slash glob segments do not steal
 * path text, and `@` only introduces attributes at the start of a line.
 * rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
 */
import type { Grammar } from 'langium';
import { DefaultTokenBuilder, type TokenBuilderOptions } from 'langium';
import { isInsideLineFence } from './reqlan-line-fences.js';

const SL_COMMENT_PATTERN = /\/\/[^\n\r]*/y;
const ML_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//y;

const slCommentPattern = (text: string, offset: number): RegExpExecArray | null => {
    if (text.charCodeAt(offset) !== 47 || text.charCodeAt(offset + 1) !== 47) {
        return null;
    }
    if (isInsideLineFence(text, offset)) {
        return null;
    }
    let previousIndex = offset - 1;
    while (previousIndex >= 0 && /[ \t]/.test(text[previousIndex]!)) {
        previousIndex--;
    }
    const previous = previousIndex >= 0 ? text[previousIndex]! : '';
    if (previous === ':' || previous === '/') {
        return null;
    }
    SL_COMMENT_PATTERN.lastIndex = offset;
    return SL_COMMENT_PATTERN.exec(text);
};

// Block comments must not open inside quotes. Reject the empty four-character
// slash-star-star-slash form so recursive globs like ../mod/**/*.rq stay path text
// in prose and naked quotes (reference STRING paths already consume the whole literal).
const mlCommentPattern = (text: string, offset: number): RegExpExecArray | null => {
    if (text.charCodeAt(offset) !== 47 || text.charCodeAt(offset + 1) !== 42) {
        return null;
    }
    if (isInsideLineFence(text, offset)) {
        return null;
    }
    ML_COMMENT_PATTERN.lastIndex = offset;
    const match = ML_COMMENT_PATTERN.exec(text);
    if (!match) {
        return null;
    }
    // /* immediately followed by */ — recursive glob segment, not a comment.
    if (match[0].length === 4) {
        return null;
    }
    return match;
};

function makeMatch(text: string, offset: number, length: number): RegExpExecArray {
    const image = text.slice(offset, offset + length);
    const match = [image] as unknown as RegExpExecArray;
    match.index = offset;
    match.input = text;
    return match;
}

/**
 * `@` marks an attribute only when it is the first non-whitespace character on a line.
 * Mid-line `@` (and `\@` at line start) fall through to OTHER as body text.
 */
const atSignAttributeMarker = (text: string, offset: number): RegExpExecArray | null => {
    if (text[offset] !== '@') {
        return null;
    }
    let previousIndex = offset - 1;
    while (previousIndex >= 0 && (text[previousIndex] === ' ' || text[previousIndex] === '\t')) {
        previousIndex--;
    }
    if (previousIndex >= 0 && text[previousIndex] !== '\n' && text[previousIndex] !== '\r') {
        return null;
    }
    return makeMatch(text, offset, 1);
};

const markdownLink = (text: string, offset: number): RegExpExecArray | null => {
    if (text[offset] !== '[' || text[offset + 1] === '[') {
        return null;
    }
    let index = offset + 1;
    while (index < text.length) {
        if (text[index] === ']' && text[index + 1] === '(') {
            const label = text.slice(offset + 1, index);
            const targetStart = index + 2;
            let targetEnd = targetStart;
            while (targetEnd < text.length && text[targetEnd] !== ')') {
                if (text[targetEnd] === '\n' || text[targetEnd] === '\r') {
                    return null;
                }
                targetEnd++;
            }
            if (targetEnd >= text.length || label.length === 0 || targetEnd === targetStart) {
                return null;
            }
            return makeMatch(text, offset, targetEnd + 1 - offset);
        }
        if (text[index] === '\n' || text[index] === '\r') {
            return null;
        }
        index++;
    }
    return null;
};

const blockOpenerLine = /^[ \t]*(?:[A-Za-z_.][\w.-]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/;

function lineStartOffset(text: string, offset: number): number {
    return text.lastIndexOf('\n', offset - 1) + 1;
}

function textBeforeOnLine(text: string, offset: number): string {
    return text.slice(lineStartOffset(text, offset), offset).replace(/[ \t]+$/, '');
}

function isEscapedAt(text: string, offset: number): boolean {
    let backslashes = 0;
    for (let index = offset - 1; index >= 0 && text[index] === '\\'; index--) {
        backslashes++;
    }
    return backslashes % 2 === 1;
}

function isStructuralOpenBraceAtDepth(text: string, offset: number, depth: number): boolean {
    if (text[offset] !== '{') {
        return false;
    }
    if (isEscapedAt(text, offset)) {
        return false;
    }
    const before = textBeforeOnLine(text, offset);

    // Top-level named blocks (`name {`) and nameless recoverable blocks (`{` alone).
    // Leading indentation is allowed — top-level ideas are often indented in fixtures.
    if (depth === 0 && (blockOpenerLine.test(before) || (isLineStartAt(text, offset) && before.trim().length === 0))) {
        return true;
    }
    // `@name {` opens an attribute block only when `@` is the first non-whitespace
    // on the line — same contract as the `@` token and Rust `is_attribute_opener`.
    // Mid-line prose such as `code @plan { goal: … }` must stay a prose brace so
    // nested `@slides` lists (tutorials.rq) do not abort the rest of the file.
    if (/^[ \t]*@[A-Za-z_][\w-]*(?::)?\s*$/.test(before)) {
        return true;
    }
    if (depth >= 1 && isLineStartAt(text, offset)) {
        return true;
    }
    if (depth >= 1 && /[A-Za-z_][\w-]*\s*$/.test(before) && !isLineStartAt(text, offset)) {
        return restOfLineIsBlank(text, offset);
    }
    return false;
}

/**
 * A `}` closes a structural block only when it is the last non-whitespace on its line
 * and it is not pairing with an unmatched prose `{` earlier on that line / in the body.
 * Own-line closers (`}` after only indentation) always close structurally so an
 * unbalanced prose `{` does not swallow the idea's closing brace.
 */
function isStructuralCloseBraceAt(text: string, offset: number): boolean {
    if (text[offset] !== '}') {
        return false;
    }
    if (isEscapedAt(text, offset)) {
        return false;
    }
    if (!restOfLineIsBlank(text, offset)) {
        return false;
    }
    const { structuralDepth, proseDepth } = braceStateBefore(text, offset);
    if (structuralDepth <= 0) {
        return false;
    }
    if (isLineStartAt(text, offset)) {
        return true;
    }
    return proseDepth === 0;
}

interface BraceScanState {
    structuralDepth: number;
    proseDepth: number;
}

/**
 * Sparse depth timeline: event `i` applies for offsets in
 * [offsets[i], offsets[i + 1]). Avoids O(n) Int32Arrays on every re-lex.
 */
interface BraceScanCache {
    text: string;
    offsets: number[];
    structuralDepth: number[];
    proseDepth: number[];
}

let braceScanCache: BraceScanCache | undefined;

function fenceEndAfter(text: string, openOffset: number): number {
    // Match CODE_FENCE: ```…``` including optional body; return index after closing fence.
    if (
        text.charCodeAt(openOffset) !== 96
        || text.charCodeAt(openOffset + 1) !== 96
        || text.charCodeAt(openOffset + 2) !== 96
    ) {
        return openOffset;
    }
    const afterOpen = openOffset + 3;
    const firstNewline = text.indexOf('\n', afterOpen);
    if (firstNewline < 0) {
        const sameLineClose = text.indexOf('```', afterOpen);
        return sameLineClose < 0 ? text.length : sameLineClose + 3;
    }
    const close = text.indexOf('```', firstNewline + 1);
    return close < 0 ? text.length : close + 3;
}

function restOfLineIsBlank(text: string, offset: number): boolean {
    for (let index = offset + 1; index < text.length; index++) {
        const char = text[index];
        if (char === '\n' || char === '\r') {
            return true;
        }
        if (char !== ' ' && char !== '\t') {
            return false;
        }
    }
    return true;
}

function buildBraceScanCache(text: string): BraceScanCache {
    let structuralDepth = 0;
    const proseDepthByStructural: number[] = [0];
    const offsets = [0];
    const structuralDepthAt = [0];
    const proseDepthAtOffsets = [0];

    const proseDepthAt = (): number => proseDepthByStructural[structuralDepth] ?? 0;
    const setProseDepth = (value: number): void => {
        proseDepthByStructural[structuralDepth] = value;
    };
    const recordStateFrom = (offset: number): void => {
        const last = offsets.length - 1;
        if (offsets[last] === offset) {
            structuralDepthAt[last] = structuralDepth;
            proseDepthAtOffsets[last] = proseDepthAt();
            return;
        }
        offsets.push(offset);
        structuralDepthAt.push(structuralDepth);
        proseDepthAtOffsets.push(proseDepthAt());
    };

    for (let index = 0; index < text.length; index++) {
        // Fenced snippets are opaque to the parser; braces inside must not change depth.
        if (
            text.charCodeAt(index) === 96
            && text.charCodeAt(index + 1) === 96
            && text.charCodeAt(index + 2) === 96
        ) {
            index = fenceEndAfter(text, index) - 1;
            continue;
        }
        const char = text[index];
        if (char === '{') {
            if (isEscapedAt(text, index)) {
                continue;
            }
            if (isStructuralOpenBraceAtDepth(text, index, structuralDepth)) {
                structuralDepth++;
                proseDepthByStructural[structuralDepth] = 0;
            } else {
                setProseDepth(proseDepthAt() + 1);
            }
            recordStateFrom(index + 1);
            continue;
        }
        if (char !== '}') {
            continue;
        }
        if (isEscapedAt(text, index)) {
            continue;
        }
        const atEndOfLine = restOfLineIsBlank(text, index);
        if (!atEndOfLine) {
            if (proseDepthAt() > 0) {
                setProseDepth(proseDepthAt() - 1);
                recordStateFrom(index + 1);
            }
            continue;
        }
        if (structuralDepth <= 0) {
            if (proseDepthAt() > 0) {
                setProseDepth(proseDepthAt() - 1);
                recordStateFrom(index + 1);
            }
            continue;
        }
        if (isLineStartAt(text, index)) {
            structuralDepth--;
            recordStateFrom(index + 1);
            continue;
        }
        if (proseDepthAt() > 0) {
            setProseDepth(proseDepthAt() - 1);
        } else {
            structuralDepth--;
        }
        recordStateFrom(index + 1);
    }

    return { text, offsets, structuralDepth: structuralDepthAt, proseDepth: proseDepthAtOffsets };
}

function braceStateAtOffset(cache: BraceScanCache, offset: number): BraceScanState {
    const { offsets, structuralDepth, proseDepth } = cache;
    let low = 0;
    let high = offsets.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (offsets[mid]! <= offset) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    const index = Math.max(0, high);
    return {
        structuralDepth: structuralDepth[index] ?? 0,
        proseDepth: proseDepth[index] ?? 0
    };
}

function braceStateBefore(text: string, offset: number): BraceScanState {
    if (braceScanCache?.text !== text) {
        braceScanCache = buildBraceScanCache(text);
    }
    const boundedOffset = Math.max(0, Math.min(offset, text.length));
    return braceStateAtOffset(braceScanCache, boundedOffset);
}

function isStructuralOpenBraceAt(text: string, offset: number): boolean {
    return isStructuralOpenBraceAtDepth(text, offset, braceStateBefore(text, offset).structuralDepth);
}

const structuralOpenBrace = (text: string, offset: number): RegExpExecArray | null => {
    if (text[offset] !== '{') {
        return null;
    }
    return isStructuralOpenBraceAt(text, offset) ? makeMatch(text, offset, 1) : null;
};

const structuralCloseBrace = (text: string, offset: number): RegExpExecArray | null => {
    if (text[offset] !== '}') {
        return null;
    }
    return isStructuralCloseBraceAt(text, offset) ? makeMatch(text, offset, 1) : null;
};

const proseOpenBrace = (text: string, offset: number): RegExpExecArray | null => {
    if (text[offset] !== '{') {
        return null;
    }
    return isStructuralOpenBraceAt(text, offset) ? null : makeMatch(text, offset, 1);
};

const proseCloseBrace = (text: string, offset: number): RegExpExecArray | null => {
    if (text[offset] !== '}') {
        return null;
    }
    return isStructuralCloseBraceAt(text, offset) ? null : makeMatch(text, offset, 1);
};

function braceDepthBefore(text: string, offset: number): number {
    return braceStateBefore(text, offset).structuralDepth;
}

function isLineStartAt(text: string, offset: number): boolean {
    let previousIndex = offset - 1;
    while (previousIndex >= 0 && (text[previousIndex] === ' ' || text[previousIndex] === '\t')) {
        previousIndex--;
    }
    return previousIndex < 0 || text[previousIndex] === '\n' || text[previousIndex] === '\r';
}

function isStringLiteralContext(text: string, offset: number): boolean {
    const depth = braceDepthBefore(text, offset);
    const trimmed = textBeforeOnLine(text, offset);
    if (depth === 0 && /\b(?:from|import)\s*$/.test(trimmed)) {
        return true;
    }
    if (/\[\s*$/.test(trimmed)) {
        return true;
    }
    if (trimmed.length === 0 && depth === 0) {
        return true;
    }
    return false;
}

/** Import keywords are reserved only at top level; in bodies they lex as ordinary words. */
function topLevelFromKeyword(text: string, offset: number): RegExpExecArray | null {
    if (!text.startsWith('from', offset)) {
        return null;
    }
    const next = text[offset + 4];
    if (next !== undefined && /[\w-]/.test(next)) {
        return null;
    }
    if (braceDepthBefore(text, offset) !== 0 || !isLineStartAt(text, offset)) {
        return null;
    }
    return makeMatch(text, offset, 4);
};

function topLevelImportKeyword(text: string, offset: number): RegExpExecArray | null {
    if (!text.startsWith('import', offset)) {
        return null;
    }
    const next = text[offset + 6];
    if (next !== undefined && /[\w-]/.test(next)) {
        return null;
    }
    if (braceDepthBefore(text, offset) !== 0) {
        return null;
    }
    if (isLineStartAt(text, offset)) {
        return makeMatch(text, offset, 6);
    }
    const before = textBeforeOnLine(text, offset);
    if (/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(before)) {
        return makeMatch(text, offset, 6);
    }
    return null;
};

function topLevelAsKeyword(text: string, offset: number): RegExpExecArray | null {
    if (!text.startsWith('as', offset)) {
        return null;
    }
    const next = text[offset + 2];
    if (next !== undefined && /[\w-]/.test(next)) {
        return null;
    }
    if (braceDepthBefore(text, offset) !== 0) {
        return null;
    }
    // `as` is reserved only on from/import lines — not after arbitrary top-level identifiers
    // (e.g. one-liner prose "such as this").
    const linePrefix = text.slice(lineStartOffset(text, offset), offset);
    if (!/^[ \t]*(?:from|import)\b/.test(linePrefix)) {
        return null;
    }
    const before = textBeforeOnLine(text, offset);
    // After import path (optionally qualified) or after a from-import specifier name.
    if (/(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(?:\.[A-Za-z_][\w-]*)*|[A-Za-z_][\w-]*)$/.test(before)) {
        return makeMatch(text, offset, 2);
    }
    return null;
};

const reqlanString = (text: string, offset: number): RegExpExecArray | null => {
    const quote = text[offset];
    if (quote !== '"' && quote !== "'") {
        return null;
    }
    if (!isStringLiteralContext(text, offset)) {
        return null;
    }
    let index = offset + 1;
    while (index < text.length) {
        const char = text[index]!;
        if (char === '\n' || char === '\r') {
            return null;
        }
        if (char === '\\') {
            index += 2;
            continue;
        }
        if (char === quote) {
            return makeMatch(text, offset, index + 1 - offset);
        }
        index++;
    }
    return null;
};

/** Body words with interior apostrophes (e.g. user's); plain identifiers stay ID. */
const reqlanWord = (text: string, offset: number): RegExpExecArray | null => {
    const match = /^[A-Za-z_][\w']*/.exec(text.slice(offset));
    if (!match || !match[0].includes("'")) {
        return null;
    }
    return makeMatch(text, offset, match[0].length);
};

export class ReqlanTokenBuilder extends DefaultTokenBuilder {
    override buildTokens(grammar: Grammar, options?: TokenBuilderOptions) {
        const tokens = super.buildTokens(grammar, options);
        if (!Array.isArray(tokens)) {
            return tokens;
        }
        const atToken = tokens.find(token => token.name === '@');
        if (atToken) {
            atToken.PATTERN = atSignAttributeMarker;
            atToken.LINE_BREAKS = false;
        }
        const markdownIndex = tokens.findIndex(token => token.name === 'MARKDOWN_LINK');
        if (markdownIndex >= 0) {
            const [markdown] = tokens.splice(markdownIndex, 1);
            tokens.unshift(markdown);
        }
        const wordIndex = tokens.findIndex(token => token.name === 'WORD');
        const idIndex = tokens.findIndex(token => token.name === 'ID');
        if (wordIndex >= 0 && idIndex >= 0 && idIndex < wordIndex) {
            const [word] = tokens.splice(wordIndex, 1);
            tokens.splice(idIndex, 0, word);
        }
        for (const [name, pattern] of [
            ['from', topLevelFromKeyword],
            ['import', topLevelImportKeyword],
            ['as', topLevelAsKeyword]
        ] as const) {
            const token = tokens.find(entry => entry.name === name);
            if (token) {
                token.PATTERN = pattern;
                token.LINE_BREAKS = false;
            }
        }
        const openBrace = tokens.find(entry => entry.name === '{');
        if (openBrace) {
            openBrace.PATTERN = structuralOpenBrace;
            openBrace.LINE_BREAKS = false;
        }
        const closeBrace = tokens.find(entry => entry.name === '}');
        if (closeBrace) {
            closeBrace.PATTERN = structuralCloseBrace;
            closeBrace.LINE_BREAKS = false;
        }
        const otherIndex = tokens.findIndex(entry => entry.name === 'OTHER');
        if (otherIndex >= 0) {
            const other = tokens[otherIndex]!;
            const basePattern = other.PATTERN;
            other.PATTERN = (text: string, offset: number) => {
                const proseBrace = proseOpenBrace(text, offset) ?? proseCloseBrace(text, offset);
                if (proseBrace) {
                    return proseBrace;
                }
                if (typeof basePattern === 'function') {
                    return basePattern(text, offset);
                }
                if (basePattern instanceof RegExp) {
                    const slice = text.slice(offset);
                    const match = basePattern.exec(slice);
                    return match?.index === 0 ? makeMatch(text, offset, match[0].length) : null;
                }
                return null;
            };
            other.LINE_BREAKS = false;
        }
        // ID is a prefix of WILDCARD_NAME (e.g. import_ vs import_*) — require longer-alt check.
        const idToken = tokens.find(entry => entry.name === 'ID');
        const wildcardToken = tokens.find(entry => entry.name === 'WILDCARD_NAME');
        if (idToken && wildcardToken) {
            const existing = idToken.LONGER_ALT;
            const alts = Array.isArray(existing) ? existing : existing ? [existing] : [];
            if (!alts.includes(wildcardToken)) {
                idToken.LONGER_ALT = [...alts, wildcardToken];
            }
        }
        return tokens;
    }

    protected override buildTerminalToken(terminal: { name: string }): import('chevrotain').TokenType {
        if (terminal.name === 'SL_COMMENT') {
            return {
                name: 'SL_COMMENT',
                GROUP: 'hidden',
                LINE_BREAKS: true,
                PATTERN: slCommentPattern
            };
        }
        if (terminal.name === 'ML_COMMENT') {
            return {
                name: 'ML_COMMENT',
                GROUP: 'hidden',
                LINE_BREAKS: true,
                PATTERN: mlCommentPattern
            };
        }
        if (terminal.name === 'MARKDOWN_LINK') {
            return {
                name: 'MARKDOWN_LINK',
                LINE_BREAKS: false,
                PATTERN: markdownLink
            };
        }
        if (terminal.name === 'STRING') {
            return {
                name: 'STRING',
                LINE_BREAKS: false,
                PATTERN: reqlanString
            };
        }
        if (terminal.name === 'WORD') {
            return {
                name: 'WORD',
                LINE_BREAKS: false,
                PATTERN: reqlanWord
            };
        }
        return super.buildTerminalToken(terminal as Parameters<DefaultTokenBuilder['buildTerminalToken']>[0]);
    }
}

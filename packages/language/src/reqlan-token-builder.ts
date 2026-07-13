/**
 * Custom token builder so line comments do not match `//` in URLs or inside string literals,
 * and so `@` only introduces attributes at the start of a line.
 */
import type { Grammar } from 'langium';
import { DefaultTokenBuilder, type TokenBuilderOptions } from 'langium';

const SL_COMMENT_PATTERN = /\/\/[^\n\r]*/y;

function isInsideNakedQuote(text: string, offset: number): boolean {
    let inDouble = false;
    let inSingle = false;
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    for (let index = lineStart; index < offset; index++) {
        const char = text[index]!;
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
        } else if (char === "'") {
            inSingle = true;
        }
    }
    return inDouble || inSingle;
}

const slCommentPattern = (text: string, offset: number): RegExpExecArray | null => {
    if (text.charCodeAt(offset) !== 47 || text.charCodeAt(offset + 1) !== 47) {
        return null;
    }
    if (isInsideNakedQuote(text, offset)) {
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

const topLevelBlockOpener = /(?:^|\n)[ \t]*(?:[A-Za-z_.][\w.]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/;

function scanStructuralBraceDepth(text: string, offset: number): number {
    let depth = 0;
    for (let index = 0; index < offset; index++) {
        if (text[index] === '{') {
            const before = text.slice(0, index).replace(/[ \t]+$/, '');
            const openDepth = depth;
            if (openDepth === 0 && topLevelBlockOpener.test(before)) {
                depth++;
            } else if (/@\w+(?::)?\s*$/.test(before)) {
                depth++;
            } else if (openDepth >= 1 && isLineStartAt(text, index)) {
                depth++;
            } else if (openDepth >= 1 && /[A-Za-z_]\w*\s*$/.test(before)) {
                const after = text.slice(index + 1);
                if (/^[ \t]*(?:\r?\n|$)/.test(after)) {
                    depth++;
                }
            }
        } else if (text[index] === '}') {
            const after = text.slice(index + 1);
            if (!/^[^ \t\r\n]/.test(after)) {
                depth--;
            }
        }
    }
    return depth;
}

function isStructuralOpenBraceAt(text: string, offset: number): boolean {
    if (text[offset] !== '{') {
        return false;
    }
    const before = text.slice(0, offset).replace(/[ \t]+$/, '');
    const depth = scanStructuralBraceDepth(text, offset);

    if (depth === 0 && topLevelBlockOpener.test(before)) {
        return true;
    }
    if (/@\w+(?::)?\s*$/.test(before)) {
        return true;
    }
    if (depth >= 1 && isLineStartAt(text, offset)) {
        return true;
    }
    if (depth >= 1 && /[A-Za-z_]\w*\s*$/.test(before) && !isLineStartAt(text, offset)) {
        const after = text.slice(offset + 1);
        return /^[ \t]*(?:\r?\n|$)/.test(after);
    }
    return false;
}

function isStructuralCloseBraceAt(text: string, offset: number): boolean {
    if (text[offset] !== '}') {
        return false;
    }
    const after = text.slice(offset + 1);
    return !/^[^ \t\r\n]/.test(after);
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
    return scanStructuralBraceDepth(text, offset);
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
    const trimmed = text.slice(0, offset).replace(/[ \t]+$/, '');
    if (depth === 0 && /\b(?:from|import)\s*$/.test(trimmed)) {
        return true;
    }
    if (/\[\s*$/.test(trimmed)) {
        return true;
    }
    const lineStart = trimmed.lastIndexOf('\n') + 1;
    if (trimmed.slice(lineStart).length === 0 && depth === 0) {
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
    if (next !== undefined && /[\w_]/.test(next)) {
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
    if (next !== undefined && /[\w_]/.test(next)) {
        return null;
    }
    if (braceDepthBefore(text, offset) !== 0) {
        return null;
    }
    if (isLineStartAt(text, offset)) {
        return makeMatch(text, offset, 6);
    }
    const before = text.slice(0, offset).replace(/[ \t]+$/, '');
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
    if (next !== undefined && /[\w_]/.test(next)) {
        return null;
    }
    if (braceDepthBefore(text, offset) !== 0) {
        return null;
    }
    const before = text.slice(0, offset).replace(/[ \t]+$/, '');
    if (/(?:[_a-zA-Z][\w_]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(before)) {
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

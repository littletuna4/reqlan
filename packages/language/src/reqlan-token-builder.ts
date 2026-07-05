/**
 * Custom token builder so line comments do not match `//` in URLs or inside string literals.
 */
import type { Grammar } from 'langium';
import { DefaultTokenBuilder, type TokenBuilderOptions } from 'langium';

const SL_COMMENT_PATTERN = /\/\/[^\n\r]*/y;

const slCommentPattern = (text: string, offset: number): RegExpExecArray | null => {
    if (text.charCodeAt(offset) !== 47 || text.charCodeAt(offset + 1) !== 47) {
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

export class ReqlanTokenBuilder extends DefaultTokenBuilder {
    override buildTokens(grammar: Grammar, options?: TokenBuilderOptions) {
        const tokens = super.buildTokens(grammar, options);
        if (!Array.isArray(tokens)) {
            return tokens;
        }
        const markdownIndex = tokens.findIndex(token => token.name === 'MARKDOWN_LINK');
        if (markdownIndex >= 0) {
            const [markdown] = tokens.splice(markdownIndex, 1);
            tokens.unshift(markdown);
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
        return super.buildTerminalToken(terminal as Parameters<DefaultTokenBuilder['buildTerminalToken']>[0]);
    }
}

/**
 * On every golden-corpus `.rq` file, C-style comment ranges from the Langium
 * lexer, findCommentSpansInText, and TextMate must be identical.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
 * rq:["../../../reqlan rq/language/syntax.rq".comments]
 * rq:["../../../reqlan rq/language/syntax.rq".inline_code]
 * rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { createReqlanServices } from '@reqlan/language';
import { INITIAL, type IGrammar } from 'vscode-textmate';
import { findCommentSpansInText } from '../src/reqlan-comment-resolver.js';
import { loadReqlanTextMateGrammar, reqlanTextMateGrammarPath } from './load-textmate-grammar.js';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const corpusDir = join(repoDir, 'testdata/golden-corpus');

const COMMENT_SCOPES = new Set(['comment.line.reqlan', 'comment.block.reqlan']);

interface CommentRange {
    start: number;
    end: number;
}

let services: ReturnType<typeof createReqlanServices>;
let textMateGrammar: IGrammar;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    textMateGrammar = await loadReqlanTextMateGrammar();
});

function rqFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...rqFiles(path));
        } else if (entry.name.endsWith('.rq')) {
            files.push(path);
        }
    }
    return files.sort();
}

function rangesFromMask(mask: boolean[]): CommentRange[] {
    const ranges: CommentRange[] = [];
    let index = 0;
    while (index < mask.length) {
        if (!mask[index]) {
            index++;
            continue;
        }
        const start = index;
        while (index < mask.length && mask[index]) {
            index++;
        }
        ranges.push({ start, end: index });
    }
    return ranges;
}

function markRange(mask: boolean[], start: number, end: number): void {
    for (let index = start; index < end && index < mask.length; index++) {
        mask[index] = true;
    }
}

function lexerCommentRanges(text: string): CommentRange[] {
    const result = services.Reqlan.parser.Lexer.tokenize(text);
    const mask = Array.from({ length: text.length }, () => false);
    for (const token of [...result.tokens, ...result.hidden]) {
        if (token.tokenType.name !== 'SL_COMMENT' && token.tokenType.name !== 'ML_COMMENT') {
            continue;
        }
        markRange(mask, token.startOffset, token.startOffset + token.image.length);
    }
    return rangesFromMask(mask);
}

function scannerCommentRanges(text: string): CommentRange[] {
    const mask = Array.from({ length: text.length }, () => false);
    for (const span of findCommentSpansInText(text)) {
        const image = text.slice(span.start, span.end);
        if (!image.startsWith('//') && !image.startsWith('/*')) {
            continue;
        }
        markRange(mask, span.start, span.end);
    }
    return rangesFromMask(mask);
}

function isCommentToken(scopes: string[]): boolean {
    return scopes.some(scope => COMMENT_SCOPES.has(scope));
}

function isBlockCommentScope(scopes: string[]): boolean {
    return scopes.includes('comment.block.reqlan');
}

function textMateCommentRanges(text: string): CommentRange[] {
    const mask = Array.from({ length: text.length }, () => false);
    const blockMask = Array.from({ length: text.length }, () => false);
    let ruleStack = INITIAL;
    let offset = 0;
    while (offset < text.length) {
        const newlineAt = text.indexOf('\n', offset);
        const lineEnd = newlineAt < 0 ? text.length : newlineAt;
        let contentEnd = lineEnd;
        if (contentEnd > offset && text[contentEnd - 1] === '\r') {
            contentEnd -= 1;
        }
        const line = text.slice(offset, contentEnd);
        const { tokens, ruleStack: next } = textMateGrammar.tokenizeLine(line, ruleStack);
        for (const token of tokens) {
            if (!isCommentToken(token.scopes)) {
                continue;
            }
            const start = offset + token.startIndex;
            const end = offset + token.endIndex;
            markRange(mask, start, end);
            if (isBlockCommentScope(token.scopes)) {
                markRange(blockMask, start, end);
            }
        }
        ruleStack = next;
        if (newlineAt < 0) {
            break;
        }
        offset = newlineAt + 1;
    }
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (char !== '\n' && char !== '\r') {
            continue;
        }
        if (char === '\r' && text[index + 1] === '\n') {
            const before = index > 0 && blockMask[index - 1] === true;
            const after = index + 2 < text.length && blockMask[index + 2] === true;
            if (before && after) {
                mask[index] = true;
                mask[index + 1] = true;
            }
            index += 1;
            continue;
        }
        const before = index > 0 && blockMask[index - 1] === true;
        const after = index + 1 < text.length && blockMask[index + 1] === true;
        if (before && after) {
            mask[index] = true;
        }
    }
    return rangesFromMask(mask);
}

function snippet(text: string, range: CommentRange): string {
    return JSON.stringify(text.slice(Math.max(0, range.start - 12), Math.min(text.length, range.end + 12)));
}

describe('Comment span alignment', () => {
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
    test('TextMate line-fences run before comments', () => {
        const grammar = JSON.parse(readFileSync(reqlanTextMateGrammarPath, 'utf8')) as {
            patterns: Array<{ include?: string }>;
            repository: Record<string, { patterns?: Array<{ include?: string }> }>;
        };
        const root = grammar.patterns.map(pattern => pattern.include);
        expect(root.indexOf('#line-fences')).toBeGreaterThanOrEqual(0);
        expect(root.indexOf('#line-fences')).toBeLessThan(root.indexOf('#comments'));
        const blockInner = grammar.repository['block-inner']?.patterns?.map(pattern => pattern.include) ?? [];
        expect(blockInner.indexOf('#line-fences')).toBeLessThan(blockInner.indexOf('#comments'));
        const oneLiner = grammar.repository['one-liner-body']?.patterns?.map(pattern => pattern.include) ?? [];
        expect(oneLiner.indexOf('#line-fences')).toBeLessThan(oneLiner.indexOf('#comments'));
    });

    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
    // rq:["../../../reqlan rq/language/syntax.rq".inline_code]
    test('backticked @reqlan/* is not a block comment', () => {
        const source = 'demo { CI uses `@reqlan/*` packages // real\n}\n';
        const lexer = lexerCommentRanges(source);
        expect(lexer).toEqual(scannerCommentRanges(source));
        expect(lexer).toEqual(textMateCommentRanges(source));
        expect(source.slice(lexer[0]!.start, lexer[0]!.end)).toBe('// real');
        expect(source).toContain('`@reqlan/*`');
    });

    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
    // rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
    test('mid-line triple backticks are not a fence', () => {
        const source = [
            'demo {',
            '    fenced ``` bodies must not open comments',
            '    after // real',
            '}',
            'later { body }',
            ''
        ].join('\n');
        const lexer = lexerCommentRanges(source);
        expect(lexer).toEqual(scannerCommentRanges(source));
        expect(lexer).toEqual(textMateCommentRanges(source));
        expect(source.slice(lexer[0]!.start, lexer[0]!.end)).toBe('// real');
    });

    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
    // rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
    test('line-start triple backticks lex as CODE_FENCE and hide inner comments', () => {
        const source = 'demo {\n```\n// not a reqlan comment\n```\n}\n';
        const result = services.Reqlan.parser.Lexer.tokenize(source);
        const fences = result.tokens.filter(token => token.tokenType.name === 'CODE_FENCE');
        expect(fences).toHaveLength(1);
        expect(fences[0]!.image).toContain('// not a reqlan comment');
        const comments = [...result.tokens, ...result.hidden]
            .filter(token => token.tokenType.name === 'SL_COMMENT' || token.tokenType.name === 'ML_COMMENT');
        expect(comments).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
    test('TextMate code-snippets fences are line-start only', () => {
        const grammar = JSON.parse(readFileSync(reqlanTextMateGrammarPath, 'utf8')) as {
            repository: Record<string, { begin?: string; end?: string }>;
        };
        expect(grammar.repository['code-snippets']?.begin).toMatch(/^\^/);
        expect(grammar.repository['code-snippets']?.end).toMatch(/^\^/);
    });

    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
    test('golden corpus C-style comment ranges match lexer, scanner, and TextMate', () => {
        const files = rqFiles(corpusDir);
        expect(files.length).toBeGreaterThan(10);
        const failures: string[] = [];
        for (const path of files) {
            const rel = relative(repoDir, path).replace(/\\/g, '/');
            const text = readFileSync(path, 'utf8');
            const lexer = lexerCommentRanges(text);
            const scanner = scannerCommentRanges(text);
            const textMate = textMateCommentRanges(text);
            if (JSON.stringify(scanner) !== JSON.stringify(lexer)) {
                failures.push(`${rel}: scanner ${JSON.stringify(scanner)} != lexer ${JSON.stringify(lexer)}`);
                continue;
            }
            if (JSON.stringify(textMate) !== JSON.stringify(lexer)) {
                const extra = textMate.filter(range => !lexer.some(left => left.start === range.start && left.end === range.end));
                const missing = lexer.filter(range => !textMate.some(right => right.start === range.start && right.end === range.end));
                failures.push(
                    `${rel}: TextMate extra=${extra.map(range => snippet(text, range)).join(' | ')} missing=${missing.map(range => snippet(text, range)).join(' | ')}`
                );
            }
        }
        expect(failures).toEqual([]);
    });
});

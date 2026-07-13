import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { createReqlanServices } from 'reqlan-language';

let services: ReturnType<typeof createReqlanServices>;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
});

describe('Naked string lexer', () => {
    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('does not emit STRING tokens for naked quotes in block body', () => {
        const text = 'demo { click "Fit to view" now }';
        const tokens = services.Reqlan.parser.Lexer.tokenize(text).tokens;
        const stringTokens = tokens.filter(token => token.tokenType.name === 'STRING');
        expect(stringTokens).toHaveLength(0);
        expect(tokens.some(token => token.image === '"')).toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('still emits STRING tokens for import paths and bracket references', () => {
        const text = 'from "./imports.rq" import x\ndemo { see ["../shared/base.rq"] }';
        const tokens = services.Reqlan.parser.Lexer.tokenize(text).tokens;
        const stringTokens = tokens.filter(token => token.tokenType.name === 'STRING');
        expect(stringTokens.map(token => token.image)).toEqual([
            '"./imports.rq"',
            '"../shared/base.rq"'
        ]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('still emits STRING token for top-level quoted idea names', () => {
        const text = '"my spaced idea" body text';
        const tokens = services.Reqlan.parser.Lexer.tokenize(text).tokens;
        const stringTokens = tokens.filter(token => token.tokenType.name === 'STRING');
        expect(stringTokens).toHaveLength(1);
        expect(stringTokens[0]?.image).toBe('"my spaced idea"');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('lexes apostrophe contractions in body as a single WORD', () => {
        const text = 'auto_reframe { those keep the user\'s current pan/zoom. }';
        const tokens = services.Reqlan.parser.Lexer.tokenize(text).tokens;
        expect(tokens.some(token => token.tokenType.name === 'WORD' && token.image === "user's")).toBe(true);
        expect(tokens.filter(token => token.image === "'")).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('lexes apostrophe contractions in one-liner body as a single WORD', () => {
        const text = "my_one_line_idea_with_appostrophe there's nothing wrong with this idea";
        const tokens = services.Reqlan.parser.Lexer.tokenize(text).tokens;
        expect(tokens.some(token => token.tokenType.name === 'WORD' && token.image === "there's")).toBe(true);
        expect(tokens.filter(token => token.image === "'")).toHaveLength(0);
    });
});

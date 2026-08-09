import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, AstUtils, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import {
    createReqlanServices,
    isBodyLine,
    isFromImport,
    isModel,
    isOneLinerIdea,
    isRichTextPart,
    type Model,
    type OneLinerIdea
} from '@reqlan/language';

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    const services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

async function expectValid(input: string): Promise<LangiumDocument<Model>> {
    const document = await parse(input);
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(document.parseResult.lexerErrors ?? []).toEqual([]);
    expect(isModel(document.parseResult.value)).toBe(true);
    return document;
}

function oneLinerText(idea: OneLinerIdea): string {
    return (idea.body?.content ?? [])
        .filter((part): part is string => typeof part === 'string')
        .join('');
}

function blockBodyText(document: LangiumDocument<Model>): string {
    return [...AstUtils.streamAst(document.parseResult.value)]
        .filter(isBodyLine)
        .flatMap(line => line.parts)
        .map(part => {
            if (typeof part === 'string') {
                return part;
            }
            if (isRichTextPart(part) && part.$type === 'RichTextPart') {
                return part.text ?? part.inlineCode ?? '';
            }
            return '';
        })
        .join('');
}

describe('comments in string context', () => {
    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('lexer does not treat URL slashes as line comments', () => {
        const services = createReqlanServices(EmptyFileSystem);
        const result = services.Reqlan.parser.Lexer.tokenize('use https://not a comment.com');
        const visible = result.tokens.map(token => token.image).join('');
        expect(visible).toContain('https://');
        expect(visible).toContain('comment.com');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('import path with https URL preserves full path', async () => {
        const document = await expectValid('from "https://not a comment.com" import foo');
        const importDecl = document.parseResult.value.imports[0];
        expect(isFromImport(importDecl) && importDecl.path).toBe('https://not a comment.com');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('quoted string containing // parses in block body', async () => {
        const document = await expectValid('demo { note "//also not a comment" here }');
        const bodyLine = [...AstUtils.streamAst(document.parseResult.value)]
            .find(node => node.$type === 'BodyLine');
        expect(bodyLine?.$cstNode?.text).toContain('"//also not a comment"');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('unquoted URL with // in one-liner body preserves text', async () => {
        const document = await expectValid('url_example use https://not a comment.com in body');
        const idea = document.parseResult.value.elements.find(isOneLinerIdea);
        expect(oneLinerText(idea!)).toContain('https://');
        expect(oneLinerText(idea!)).toContain('comment.com');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('quoted one-liner with // inside preserves text', async () => {
        const document = await expectValid('url_example "https://not a comment.com //still not"');
        const idea = document.parseResult.value.elements.find(isOneLinerIdea);
        expect(idea?.$cstNode?.text).toContain('"https://not a comment.com //still not"');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('unquoted URL with // in block body preserves text', async () => {
        const document = await expectValid('demo { see https://not a comment.com for details }');
        expect(blockBodyText(document)).toContain('https://');
        expect(blockBodyText(document)).toContain('comment.com');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('single-quoted URL in block body is naked prose', async () => {
        const document = await expectValid("demo { e.g. a 'https://not a comment.com' in prose }");
        const bodyLine = [...AstUtils.streamAst(document.parseResult.value)]
            .find(node => node.$type === 'BodyLine');
        expect(bodyLine?.$cstNode?.text).toContain("'https://not a comment.com'");
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('meta line comments after content still work', async () => {
        const document = await expectValid('demo {\n    keep this // meta comment\n}');
        expect(blockBodyText(document)).toContain('keep');
        expect(blockBodyText(document)).toContain('this');
        expect(blockBodyText(document)).not.toContain('meta comment');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('full-line comments still work', async () => {
        await expectValid('// leading comment\ndemo { body }');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('e2e: /**/ glob survives tokenize → parse in prose, naked quotes, and reference STRING', async () => {
        const services = createReqlanServices(EmptyFileSystem);

        const prose = 'demo { see ../mod/**/*.rq here }';
        const proseTokens = services.Reqlan.parser.Lexer.tokenize(prose);
        expect(proseTokens.tokens.map(token => token.image).join('')).toContain('**');
        const proseDoc = await expectValid(prose);
        expect(blockBodyText(proseDoc)).toContain('**');

        const naked = 'demo { see "../mod/**/*.rq" here }';
        const nakedTokens = services.Reqlan.parser.Lexer.tokenize(naked);
        expect(nakedTokens.tokens.map(token => token.image).join('')).toContain('**');
        const nakedDoc = await expectValid(naked);
        expect(nakedDoc.textDocument.getText()).toContain('/**/');

        const reference = 'demo { ["../mod/**/*.rq".*_pane] keep }';
        const referenceDoc = await expectValid(reference);
        const ref = [...AstUtils.streamAst(referenceDoc.parseResult.value)]
            .find(node => node.$type === 'BracketReference');
        expect(ref?.$cstNode?.text).toBe('["../mod/**/*.rq".*_pane]');
        expect(referenceDoc.textDocument.getText()).toContain('/**/');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('e2e: real block comments still hide body text', async () => {
        const document = await expectValid('demo {\n    keep /* hidden\n       block */ this\n}');
        expect(blockBodyText(document)).toContain('keep');
        expect(blockBodyText(document)).toContain('this');
        expect(blockBodyText(document)).not.toContain('hidden');
        expect(blockBodyText(document)).not.toContain('block');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('e2e: reference STRING with // tokenizes, parses, and keeps path text', async () => {
        const services = createReqlanServices(EmptyFileSystem);
        const input = `demo {\n    ["a reference containing '//' that doesn't start a comment"]\n    ["https://host/file.rq".idea]\n}`;
        const tokens = services.Reqlan.parser.Lexer.tokenize(input);
        expect(tokens.tokens.some(token => token.tokenType.name === 'STRING' && token.image.includes('//'))).toBe(true);
        const document = await expectValid(input);
        const refs = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(node => node.$type === 'BracketReference')
            .map(node => node.$cstNode?.text);
        expect(refs).toEqual(expect.arrayContaining([
            `["a reference containing '//' that doesn't start a comment"]`,
            '["https://host/file.rq".idea]'
        ]));
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('e2e: meta comment after reference still hides trailing text', async () => {
        const document = await expectValid('demo {\n    ["path.rq".idea] // meta only\n    keep\n}');
        expect(blockBodyText(document)).toContain('keep');
        expect(blockBodyText(document)).not.toContain('meta only');
    });
});

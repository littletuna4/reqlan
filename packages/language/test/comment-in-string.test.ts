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
} from 'reqlan-language';

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
    return idea.body.content
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
                return part.text ?? part.inlineCode ?? part.punct ?? '';
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
    test('quoted string containing // parses in block body', async () => {
        const document = await expectValid('demo { note "//also not a comment" here }');
        expect(blockBodyText(document)).toContain('//also not a comment');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('unquoted URL with // in one-liner body preserves text', async () => {
        const document = await expectValid('url_example use https://not a comment.com in body');
        const idea = document.parseResult.value.elements.find(isOneLinerIdea);
        expect(oneLinerText(idea!)).toContain('https://');
        expect(oneLinerText(idea!)).toContain('comment.com');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('quoted one-liner with // inside preserves text', async () => {
        const document = await expectValid('url_example "https://not a comment.com //still not"');
        const idea = document.parseResult.value.elements.find(isOneLinerIdea);
        expect(oneLinerText(idea!)).toContain('https://not a comment.com //still not');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('unquoted URL with // in block body preserves text', async () => {
        const document = await expectValid('demo { see https://not a comment.com for details }');
        expect(blockBodyText(document)).toContain('https://');
        expect(blockBodyText(document)).toContain('comment.com');
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
});

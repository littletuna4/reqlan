import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import type { Model } from 'reqlan-language';
import { createReqlanServices, isIdea, isModel, isSimpleIdea } from 'reqlan-language';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const exampleDir = join(repoDir, 'example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

describe('Parsing tests', () => {

    test('parse example main.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'main.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const ideas = document.parseResult.value.elements.filter(isIdea);
        expect(ideas.map(idea => idea.name)).toEqual(['myidea', 'my idea2']);
        const simpleIdeas = document.parseResult.value.elements.filter(isSimpleIdea);
        expect(simpleIdeas.map(idea => idea.name)).toEqual([
            'my_unbracketed_one_liner_idea',
            'my_second_idea',
            'a_simple_idea'
        ]);
        expect(simpleIdeas[0]?.tokens?.join(' ')).toBe('ideas should support one liners');
        expect(simpleIdeas[1]?.tokens?.join(' ')).toBe('this is a blob of text');
    });

    test('parse example sub idea.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'sub idea.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.imports).toHaveLength(5);
    });

    test('parse ontology.rq simple ideas', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/language/ontology.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const simpleIdeas = document.parseResult.value.elements.filter(isSimpleIdea);
        expect(simpleIdeas.map(idea => idea.name)).toEqual([
            'idea',
            'ideaset',
            'file',
            'import_statement',
            'reference',
            'extension',
            'grammar_rule',
            'attribute',
            'attribute_body',
            'idea_name'
        ]);
    });

    test('parse one-liner ideas', async () => {
        const document = await parse(`my_unbracketed_one_liner_idea ideas should support one liners
my_second_idea this is a blob of text`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const simpleIdeas = document.parseResult.value.elements.filter(isSimpleIdea);
        expect(simpleIdeas.map(idea => idea.name)).toEqual([
            'my_unbracketed_one_liner_idea',
            'my_second_idea'
        ]);
        expect(simpleIdeas[0]?.tokens?.join(' ')).toBe('ideas should support one liners');
        expect(simpleIdeas[1]?.tokens?.join(' ')).toBe('this is a blob of text');
    });

    test('parse inline idea', async () => {
        const document = await parse(`myidea {
            It should be a good thing.
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements[0];
        expect(isIdea(idea) && idea.name).toBe('myidea');
    });

    test('parse import keywords in idea body text', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'exampleimport2.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse body text containing from import as words', async () => {
        const document = await parse(`demo {
            copy from import as needed.
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isModel(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a 'Model'.`
        || undefined;
}

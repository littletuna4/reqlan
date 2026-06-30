import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, AstUtils, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import type { Model, OneLinerIdea } from 'reqlan-language';
import { createReqlanServices, isFileReference, isIdea, isModel, isOneLinerIdea } from 'reqlan-language';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const exampleDir = join(repoDir, 'example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

function oneLinerText(idea: OneLinerIdea): string {
    return idea.body.content
        .filter((part): part is string => typeof part === 'string')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

describe('Parsing tests', () => {

    test('parse example main.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'main.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const ideas = document.parseResult.value.elements.filter(isIdea);
        expect(ideas.map(idea => idea.name)).toEqual(['myidea', 'my idea2']);
        const oneLiners = document.parseResult.value.elements.filter(isOneLinerIdea);
        expect(oneLiners.map(idea => idea.name)).toEqual([
            'my_unbracketed_one_liner_idea',
            'my_second_idea',
            'a_simple_idea'
        ]);
        expect(oneLinerText(oneLiners[0]!)).toBe('ideas should support one liners');
        expect(oneLinerText(oneLiners[1]!)).toBe('this is a blob of text');
    });

    test('parse example sub idea.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'sub idea.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.imports).toHaveLength(5);
    });

    test('parse ontology.rq one-liner ideas', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/language/ontology.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiners = document.parseResult.value.elements.filter(isOneLinerIdea);
        expect(oneLiners.map(idea => idea.name)).toEqual([
            'idea',
            'ideaset',
            'file',
            'keyword',
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
        const oneLiners = document.parseResult.value.elements.filter(isOneLinerIdea);
        expect(oneLiners.map(idea => idea.name)).toEqual([
            'my_unbracketed_one_liner_idea',
            'my_second_idea'
        ]);
        expect(oneLinerText(oneLiners[0]!)).toBe('ideas should support one liners');
        expect(oneLinerText(oneLiners[1]!)).toBe('this is a blob of text');
    });

    test('one-liner body does not continue on the next line', async () => {
        const document = await parse(`first_idea line one
continued prose belongs to a new declaration
second_idea line two`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiners = document.parseResult.value.elements.filter(isOneLinerIdea);
        expect(oneLiners.map(idea => idea.name)).toEqual([
            'first_idea',
            'continued',
            'second_idea'
        ]);
        expect(oneLinerText(oneLiners[0]!)).toBe('line one');
        expect(oneLinerText(oneLiners[2]!)).toBe('line two');
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

    test('parse file references in a reqfile.rq', async () => {
        const document = await parse(readFileSync(
            join(exampleDir, 'a source folder/a reqfile.rq'),
            'utf8'
        ));
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse code snippet in block idea', async () => {
        const document = await parse(`demo {
            Example usage:
            \`\`\`python
            print("hello")
            \`\`\`
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse list items as one-liners and anonymous blocks', async () => {
        const document = await parse(`demo {
            @tags: (
                todo
                highpriority
            )
            @plan: {
                steps (
                    - do the thing
                    - do the other thing
                )
            }
            @refs: (
                { see [[beta]] }
            )
        }
        beta {
            target
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse file references in list items', async () => {
        const document = await parse(`demo {
            @tests: (
                ["../../packages/language/test/validating.test.ts:reports duplicate when local idea shares imported idea name"]
            )
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const listItem = [...AstUtils.streamAst(document.parseResult.value)]
            .find(node => node.$type === 'OneLinerListItem');
        expect(listItem).toBeDefined();
        const fileReferences = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isFileReference);
        const bracketReferences = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(node => node.$type === 'BracketReference') as Array<{ target: { $type: string; file?: string } }>;
        expect(bracketReferences).toHaveLength(1);
        expect(bracketReferences[0]?.target.$type).toBe('FileReference');
        expect(fileReferences).toHaveLength(1);
        expect(fileReferences[0]?.file).toContain('validating.test.ts');
    });

    test('parse idea.attribute and ideaset references', async () => {
        const document = await parse(`demo {
            see [my_ideaset] and [myidea.status]
        }
        my_ideaset (
            myidea
        )
        myidea {
            body text
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse named block list items and nested lists in idea bodies', async () => {
        const document = await parse(`demo {
            @subreqs (
                duplicate_error {
                    should be raised if the idea has the same name.
                    @tests: (
                        ["../../packages/language/test/validating.test.ts:reports duplicate"]
                    )
                }
            )
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    test('parse features-syntax.rq', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/extension/features-syntax.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.elements.map(element => element.name)).toContain('sensible_alias_support');
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

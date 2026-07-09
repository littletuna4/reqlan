import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, AstUtils, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import type { Model, OneLinerIdea } from 'reqlan-language';
import { createReqlanServices, isBracketReference, isFileReference, isFromImport, isIdea, isModel, isOneLinerIdea } from 'reqlan-language';
import { getReferencePrefixContext } from '../src/reqlan-completion-context.js';
import { isMarkdownLinkLabelPosition } from '../src/reqlan-markdown-links.js';

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

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
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

    // rq:["../../../reqlan rq/extension/features-imports.rq".from_import_syntax]
    test('parse from import with multiple symbols', async () => {
        const document = await parse('from "./example.rq" import symbol1, symbol2, symbol3');
        expect(checkDocumentValid(document)).toBeUndefined();
        const fromImport = document.parseResult.value.imports.find(isFromImport);
        expect(fromImport?.path).toBe('./example.rq');
        expect(fromImport?.specifiers.map(specifier => specifier.idea.$refText)).toEqual([
            'symbol1',
            'symbol2',
            'symbol3'
        ]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".import_from]
    test('parse example sub idea.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'sub idea.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.imports).toHaveLength(5);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
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
            'referenced_files',
            'cartographic_map',
            'extension',
            'grammar_rule',
            'attribute',
            'attribute_body',
            'idea_name'
        ]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
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

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
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

    // rq:["../../../reqlan rq/language/syntax.rq".block_idea]
    test('parse inline idea', async () => {
        const document = await parse(`myidea {
            It should be a good thing.
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements[0];
        expect(isIdea(idea) && idea.name).toBe('myidea');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".keywords]
    test('parse import keywords in idea body text', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'exampleimport2.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".keywords]
    test('parse body text containing from import as words', async () => {
        const document = await parse(`demo {
            copy from import as needed.
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_file]
    test('parse file references in a reqfile.rq', async () => {
        const document = await parse(readFileSync(
            join(exampleDir, 'a source folder/a reqfile.rq'),
            'utf8'
        ));
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
    test('parse code snippet in block idea', async () => {
        const document = await parse(`demo {
            Example usage:
            \`\`\`python
            print("hello")
            \`\`\`
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".lists]
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

    // rq:["../../../reqlan rq/development/core.rq".testing]
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
            .filter(isBracketReference);
        expect(bracketReferences).toHaveLength(1);
        const target = bracketReferences[0]?.target;
        expect(
            (target?.$type === 'FileReference' && target.file.includes('validating.test.ts'))
            || (target?.$type === 'QualifiedReference' && target.path?.$refText?.includes('validating.test.ts'))
        ).toBe(true);
        expect(
            fileReferences[0]?.file?.includes('validating.test.ts')
            ?? target?.$type === 'QualifiedReference'
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_brackets]
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

    // rq:["../../../reqlan rq/language/syntax.rq".lists]
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

    // rq:["../../../reqlan rq/extension/features-syntax.rq".syntax_features]
    test('parse features-syntax.rq', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/extension/features-syntax.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.elements.map(element => element.name)).toContain('sensible_alias_support');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".markdown_links]
    test('parse markdown links without treating label as a reference', async () => {
        const document = await parse(`demo see [the label](path/here) and [myidea] refs
myidea {
    body
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiner = document.parseResult.value.elements.find(isOneLinerIdea);
        const markdownLink = oneLiner?.body.content.find(part => typeof part !== 'string' && part.$type === 'MarkdownLink');
        expect(markdownLink && 'raw' in markdownLink && markdownLink.raw).toBe('[the label](path/here)');
        const bracketReferences = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isBracketReference);
        expect(bracketReferences).toHaveLength(1);
        const target = bracketReferences[0]?.target;
        expect(
            target?.$type === 'LocalReference'
            || (target?.$type === 'QualifiedReference' && target.qualifier?.$refText === 'myidea')
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".markdown_links]
    test('parse docs.rq markdown folder link', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/docs/docs.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiner = document.parseResult.value.elements.find(isOneLinerIdea);
        const markdownLink = oneLiner?.body.content.find(part => typeof part !== 'string' && part.$type === 'MarkdownLink');
        expect(markdownLink && 'raw' in markdownLink && markdownLink.raw).toBe(
            '[the reqlan rq folder of this repo](../../reqlan rq)'
        );
    });

    // rq:["../../../reqlan rq/language/syntax.rq".markdown_links]
    test('markdown link labels are not treated as reference prefix context', async () => {
        const services = createReqlanServices(EmptyFileSystem);
        const parse = parseHelper<Model>(services.Reqlan);
        const document = await parse(`demo { see [label](target) }
label { body }`);
        const labelOffset = document.textDocument.getText().indexOf('label');
        const position = document.textDocument.positionAt(labelOffset);
        expect(getReferencePrefixContext(document, position)).toBeUndefined();
        expect(isMarkdownLinkLabelPosition(document, position)).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/module/graphical_graph.rq".graphical_graph]
    test('parse bare numbers in body text', async () => {
        const document = await parse(s`
            graphical_graph {
                An "Indirect references" toggle expands neighbourhood depth from 1 to 2 hops.
            }
        `);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".attribute_values]
    test('parse syntax_whitespace.rq body lines and insignificant attribute whitespace', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/language/syntax_whitespace.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements.find(isIdea);
        expect(idea?.name).toBe('syntax_whitespace');
        expect(idea?.elements.map(element => element.$type)).toEqual([
            'BodyLine',
            'BodyLine',
            'Attribute',
            'BodyLine',
            'Attribute',
            'BodyLine'
        ]);
        const attributes = idea?.elements.filter(element => element.$type === 'Attribute');
        expect(attributes?.map(attribute => 'name' in attribute && attribute.name)).toEqual([
            'exampleattribute',
            'perfectly_acceptable_attribute'
        ]);
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

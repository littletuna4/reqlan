import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import type { Model } from 'reqlan-language';
import { createReqlanServices, isIdea, isModel } from 'reqlan-language';

const exampleDir = join(dirname(fileURLToPath(import.meta.url)), '../../../example_rq_project');

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
    });

    test('parse example sub idea.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'sub idea.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.imports).toHaveLength(4);
    });

    test('parse inline idea', async () => {
        const document = await parse(`myidea {
            It should be a good thing.
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements[0];
        expect(isIdea(idea) && idea.name).toBe('myidea');
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

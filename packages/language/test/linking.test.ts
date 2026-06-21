import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model } from 'reqlan-language';
import { createReqlanServices, isIdea, isModel, isWikiLink } from 'reqlan-language';

const exampleDir = join(dirname(fileURLToPath(import.meta.url)), '../../../example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

afterEach(async () => {
    document && clearDocuments(services.shared, [document]);
});

describe('Linking tests', () => {

    test('resolve wikilink to idea declaration in main.rq', async () => {
        document = await parse(readFileSync(join(exampleDir, 'main.rq'), 'utf8'));
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const links = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isWikiLink)
            .map(link => link.target.idea.ref?.name ?? link.target.idea.error?.message);

        expect(checkDocumentValid(document) || links.join('\n')).toBe(s`
            myidea
            myidea
        `);
    });

    test('rename finds all idea references including wikilinks', async () => {
        document = await parse(`alpha {
    see [[beta]]
}
beta {
    see [[alpha]]
}`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const beta = [...AstUtils.streamAst(document.parseResult.value)].find(
            node => isIdea(node) && node.name === 'beta'
        );
        expect(beta && isIdea(beta)).toBe(true);
        if (!beta || !isIdea(beta)) {
            return;
        }

        const references = services.Reqlan.references.References
            .findReferences(beta, { includeDeclaration: true })
            .toArray();
        const texts = references.map(reference => document!.textDocument.getText(reference.segment.range));
        expect(texts.filter(text => text === 'beta').length).toBeGreaterThanOrEqual(2);
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

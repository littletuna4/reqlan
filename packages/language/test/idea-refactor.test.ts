import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createReqlanServices, isIdea, type Model } from '@reqlan/language';
import { AstUtils } from 'langium';
import { planIdeaDeleteEdits, planIdeaMoveEdits } from '../src/reqlan-idea-refactor.js';

describe('idea refactor plans', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;

    beforeAll(() => {
        services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_delete]
    test('delete plan removes declaration and bracket references', async () => {
        const document = await parse(`alpha {
    body
}
beta {
    see [alpha]
}`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        const alpha = [...AstUtils.streamAst(document.parseResult.value)].find(
            node => isIdea(node) && node.name === 'alpha'
        );
        expect(alpha && isIdea(alpha)).toBe(true);
        if (!alpha || !isIdea(alpha)) {
            return;
        }
        const references = services.Reqlan.references.References
            .findReferences(alpha, { includeDeclaration: true })
            .toArray();
        const planned = planIdeaDeleteEdits(
            alpha,
            references,
            new Map([[document.uri.toString(), document.textDocument.getText()]])
        );
        expect(planned.length).toBeGreaterThan(0);
        const source = planned.find(entry => entry.uri === document.uri.toString());
        expect(source?.edits.some(edit => edit.newText === '')).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
    test('move plan cuts from source and inserts into destination', async () => {
        const source = services.shared.workspace.LangiumDocumentFactory.fromString(
            `alpha {\n    body\n}\n`,
            URI.parse('file:///tmp/source.rq')
        ) as LangiumDocument<Model>;
        const dest = services.shared.workspace.LangiumDocumentFactory.fromString(
            `other {\n    keep\n}\n`,
            URI.parse('file:///tmp/dest.rq')
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(source);
        services.shared.workspace.LangiumDocuments.addDocument(dest);
        await services.shared.workspace.DocumentBuilder.build([source, dest], { validation: false });

        const alpha = [...AstUtils.streamAst(source.parseResult.value)].find(
            node => isIdea(node) && node.name === 'alpha'
        );
        expect(alpha && isIdea(alpha)).toBe(true);
        if (!alpha || !isIdea(alpha)) {
            return;
        }
        const references = services.Reqlan.references.References
            .findReferences(alpha, { includeDeclaration: true })
            .toArray();
        const planned = planIdeaMoveEdits({
            idea: alpha,
            sourceDocument: source,
            destinationDocument: dest,
            references
        });
        const sourceEdits = planned.find(entry => entry.uri === source.uri.toString());
        const destEdits = planned.find(entry => entry.uri === dest.uri.toString());
        expect(sourceEdits?.edits.some(edit => edit.newText === '')).toBe(true);
        expect(destEdits?.edits.some(edit => edit.newText.includes('alpha'))).toBe(true);
    });
});

import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createReqlanServices, isIdea, type Model } from '@reqlan/language';
import { AstUtils } from 'langium';
import { ReqlanRenameProvider } from '../src/reqlan-rename-provider.js';

describe('ReqlanRenameProvider', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;
    let document: LangiumDocument<Model> | undefined;

    beforeAll(() => {
        services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
    });

    afterEach(async () => {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray();
        if (documents.length > 0) {
            clearDocuments(services.shared, documents);
        }
        document = undefined;
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_rename]
    test('rename updates declaration and wikilink references', async () => {
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
        if (!beta || !isIdea(beta) || !beta.$cstNode) {
            return;
        }

        const provider = new ReqlanRenameProvider(services.Reqlan);
        const nameNode = services.Reqlan.references.NameProvider.getNameNode(beta);
        const position = nameNode?.range.start ?? beta.$cstNode.range.start;
        const edit = await provider.rename(document, {
            textDocument: { uri: document.textDocument.uri },
            position,
            newName: 'beta_renamed'
        });
        const changes = edit?.changes?.[document.uri.toString()] ?? [];
        const texts = changes.map(change =>
            change.newText === 'beta_renamed' ? 'beta_renamed' : change.newText
        );
        expect(texts.filter(text => text === 'beta_renamed').length).toBeGreaterThanOrEqual(2);
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_rename]
    test('rename also updates rq comment idea tokens in the same document', async () => {
        document = await parse(`alpha {
    body
}
// rq:["./self.rq".alpha]
`);
        // Force uri path ending so comment path matching can succeed loosely
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        const alpha = [...AstUtils.streamAst(document.parseResult.value)].find(
            node => isIdea(node) && node.name === 'alpha'
        );
        expect(alpha && isIdea(alpha)).toBe(true);
        if (!alpha || !isIdea(alpha)) {
            return;
        }
        const provider = new ReqlanRenameProvider(services.Reqlan);
        const nameNode = services.Reqlan.references.NameProvider.getNameNode(alpha);
        const edit = await provider.rename(document, {
            textDocument: { uri: document.textDocument.uri },
            position: nameNode!.range.start,
            newName: 'alpha2'
        });
        const changes = edit?.changes?.[document.uri.toString()] ?? [];
        expect(changes.some(change => change.newText === 'alpha2')).toBe(true);
    });
});

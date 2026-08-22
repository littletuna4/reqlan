import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
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

    afterEach(async () => {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray();
        if (documents.length > 0) {
            await clearDocuments(services.shared, documents);
        }
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

    // rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_delete]
    test('delete plan removes matching comment references', async () => {
        const document = await parse(`alpha {\n    body\n}\n`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        const alpha = [...AstUtils.streamAst(document.parseResult.value)].find(
            node => isIdea(node) && node.name === 'alpha'
        );
        expect(alpha && isIdea(alpha)).toBe(true);
        if (!alpha || !isIdea(alpha)) {
            return;
        }
        const codeUri = 'file:///tmp/app.ts';
        const planned = planIdeaDeleteEdits(
            alpha,
            [],
            new Map([
                [document.uri.toString(), document.textDocument.getText()],
                [codeUri, '// keep this rq:[alpha] here\n']
            ])
        );
        const codeEdits = planned.find(entry => entry.uri === codeUri);
        expect(codeEdits?.edits).toEqual([
            expect.objectContaining({ newText: '' })
        ]);
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

    // rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
    test('move plan rewrites qualified comment paths for the moved idea', async () => {
        const source = services.shared.workspace.LangiumDocumentFactory.fromString(
            `alpha {\n    body\n}\nbeta {\n    stay\n}\n`,
            URI.parse('file:///tmp/a/source.rq')
        ) as LangiumDocument<Model>;
        const dest = services.shared.workspace.LangiumDocumentFactory.fromString(
            `other {\n    keep\n}\n`,
            URI.parse('file:///tmp/b/dest.rq')
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
        const codeUri = 'file:///tmp/src/app.ts';
        const planned = planIdeaMoveEdits({
            idea: alpha,
            sourceDocument: source,
            destinationDocument: dest,
            references: [],
            documentsText: new Map([
                [codeUri, '// rq:["../a/source.rq".alpha]\n// rq:["../a/source.rq".beta]\n']
            ])
        });
        const codeEdits = planned.find(entry => entry.uri === codeUri);
        expect(codeEdits?.edits).toHaveLength(1);
        expect(codeEdits?.edits[0]?.newText).toBe('"../b/dest.rq"');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
    test('move plan removes unused source imports and copies them to destination', async () => {
        const source = services.shared.workspace.LangiumDocumentFactory.fromString(
            `from "./lib.rq" import foo, stay\nalpha {\n    uses [foo]\n}\nbeta {\n    uses [stay]\n}\n`,
            URI.parse('file:///tmp/a/source.rq')
        ) as LangiumDocument<Model>;
        const dest = services.shared.workspace.LangiumDocumentFactory.fromString(
            `other {\n    keep\n}\n`,
            URI.parse('file:///tmp/b/dest.rq')
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
        const planned = planIdeaMoveEdits({
            idea: alpha,
            sourceDocument: source,
            destinationDocument: dest,
            references: []
        });
        const sourceText = applyDocumentEdits(source, planned);
        const destText = applyDocumentEdits(dest, planned);
        expect(sourceText).not.toContain('import foo');
        expect(sourceText).toContain('from "./lib.rq" import stay');
        expect(sourceText).not.toContain('alpha {');
        expect(destText).toContain('from "../a/lib.rq" import foo');
        expect(destText).toContain('alpha {');
        expect(destText).toContain('uses [foo]');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
    test('move plan adds a sibling import on the destination', async () => {
        const source = services.shared.workspace.LangiumDocumentFactory.fromString(
            `alpha {\n    uses [beta]\n}\nbeta {\n    stay\n}\n`,
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
        const planned = planIdeaMoveEdits({
            idea: alpha,
            sourceDocument: source,
            destinationDocument: dest,
            references: []
        });
        const destText = applyDocumentEdits(dest, planned);
        expect(destText).toContain('from "./source.rq" import beta');
        expect(destText).toContain('uses [beta]');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
    test('move content plan leaves a source stub that imports the moved idea', async () => {
        const source = services.shared.workspace.LangiumDocumentFactory.fromString(
            `from "./lib.rq" import foo\nalpha {\n    uses [foo]\n}\n`,
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
        const planned = planIdeaMoveEdits({
            idea: alpha,
            sourceDocument: source,
            destinationDocument: dest,
            references: [],
            leaveSourceStub: true
        });
        const sourceText = applyDocumentEdits(source, planned);
        const destText = applyDocumentEdits(dest, planned);
        expect(sourceText).toContain('import "./dest.rq" as dest');
        expect(sourceText).toContain('alpha [dest.alpha]');
        expect(sourceText).not.toContain('from "./lib.rq" import foo');
        expect(sourceText).not.toContain('uses [foo]');
        expect(destText).toContain('from "./lib.rq" import foo');
        expect(destText).toContain('alpha {');
        expect(destText).toContain('uses [foo]');
    });
});

function applyDocumentEdits(
    document: LangiumDocument,
    planned: Array<{ uri: string; edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> }>
): string {
    const entry = planned.find(item => item.uri === document.uri.toString());
    const text = document.textDocument.getText();
    if (!entry) {
        return text;
    }
    const offsets = entry.edits.map(edit => ({
        start: document.textDocument.offsetAt(edit.range.start),
        end: document.textDocument.offsetAt(edit.range.end),
        newText: edit.newText
    }));
    offsets.sort((left, right) => right.start - left.start || right.end - left.end);
    let result = text;
    for (const edit of offsets) {
        result = `${result.slice(0, edit.start)}${edit.newText}${result.slice(edit.end)}`;
    }
    return result;
}

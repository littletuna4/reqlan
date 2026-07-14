/**
 * Tests for unresolved-reference import quick fixes.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { expandToString as s } from 'langium/generate';
import type { CodeAction } from 'vscode-languageserver';
import type { Model } from 'reqlan-language';
import {
    collectImportErrorCodeActions,
    createReqlanServices,
    REQLAN_IMPORT_ERROR_CREATE_COMMAND,
    REQLAN_IMPORT_ERROR_SEARCH_COMMAND,
    ReqlanCodeActionProvider,
    sharedNameCatalog,
    type NameCatalog
} from 'reqlan-language';

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
    sharedNameCatalog.reset();
});

async function parseUri(text: string, uri: string): Promise<LangiumDocument<Model>> {
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
        text,
        URI.parse(uri)
    ) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(document);
    return document;
}

function isCodeAction(value: unknown): value is CodeAction {
    return typeof value === 'object' && value !== null && 'title' in value;
}

describe('Import error code actions', () => {
    test('offers add-import and rewrite when a matching idea exists elsewhere', async () => {
        const library = await parseUri(s`
            shared_idea {
                body
            }
        `, 'file:///workspace/lib/shared.rq');
        const document = await parseUri(s`
            consumer {
                [shared_idea] should resolve after import.
            }
        `, 'file:///workspace/app/consumer.rq');

        await services.shared.workspace.DocumentBuilder.build([library, document], { validation: true });

        const unresolved = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve reference')
        );
        expect(unresolved.length).toBeGreaterThan(0);

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = collectImportErrorCodeActions(provider, document).filter(isCodeAction);
        const titles = actions.map(action => action.title);

        expect(titles.some(title => title.includes('Add import from') && title.includes('shared.rq'))).toBe(true);
        expect(titles.some(title => title.includes('Change to') && title.includes('shared_idea'))).toBe(true);
        expect(titles).toContain(`Search index for 'shared_idea'…`);
        expect(titles).toContain(`Create 'shared_idea' in a new file and import it…`);

        const addImport = actions.find(action => action.title.includes('Add import from'));
        expect(addImport?.edit?.changes?.[document.textDocument.uri]?.[0]?.newText)
            .toContain('from "../lib/shared.rq" import shared_idea');
        expect(addImport?.isPreferred).toBe(true);
    });

    test('uses name catalog matches when documents are not loaded', async () => {
        const catalog: NameCatalog = {
            entries: [{
                name: 'catalog_only',
                kind: 'idea',
                fileUri: 'file:///workspace/remote/catalog.rq'
            }]
        };
        sharedNameCatalog.update(catalog);

        const document = await parse(s`
            consumer {
                [catalog_only]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = collectImportErrorCodeActions(provider, document).filter(isCodeAction);
        const addImport = actions.find(action => action.title.includes('Add import from'));
        expect(addImport).toBeDefined();
        expect(addImport?.edit?.changes?.[document.textDocument.uri]?.[0]?.newText)
            .toContain('import catalog_only');
    });

    test('search and create actions invoke extension commands', async () => {
        const document = await parse(s`
            consumer {
                [missing_target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = collectImportErrorCodeActions(provider, document).filter(isCodeAction);

        const search = actions.find(action => action.title.startsWith('Search index'));
        expect(search?.command?.command).toBe(REQLAN_IMPORT_ERROR_SEARCH_COMMAND);
        expect(search?.command?.arguments?.[0]).toMatchObject({
            refText: 'missing_target',
            documentUri: document.textDocument.uri
        });

        const create = actions.find(action => action.title.startsWith('Create'));
        expect(create?.command?.command).toBe(REQLAN_IMPORT_ERROR_CREATE_COMMAND);
    });

    test('appends to an existing from-import for the same path', async () => {
        const library = await parseUri(s`
            alpha {
                a
            }
            beta {
                b
            }
        `, 'file:///workspace/lib/pair.rq');
        const document = await parseUri(s`
            from "./pair.rq" import alpha

            consumer {
                [beta]
            }
        `, 'file:///workspace/lib/consumer.rq');

        await services.shared.workspace.DocumentBuilder.build([library, document], { validation: true });

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = collectImportErrorCodeActions(provider, document).filter(isCodeAction);
        const addImport = actions.find(action => action.title.includes('Add import from'));
        expect(addImport?.edit?.changes?.[document.textDocument.uri]?.[0]?.newText).toBe(', beta');
    });
});

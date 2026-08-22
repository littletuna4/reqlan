/**
 * Tests for unresolved-reference import quick fixes.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { expandToString as s } from 'langium/generate';
import type { CodeAction } from 'vscode-languageserver';
import type { Model } from '@reqlan/language';
import {
    collectImportErrorCodeActions,
    createReqlanServices,
    findIdeaReferenceAtPosition,
    findReferenceSearchSite,
    REQLAN_BARREL_PAGE_COMMAND,
    REQLAN_BARREL_PAGE_KIND,
    REQLAN_IMPORT_ERROR_CREATE_COMMAND,
    REQLAN_REFACTOR_DELETE_IDEA_COMMAND,
    REQLAN_REFACTOR_MOVE_IDEA_COMMAND,
    REQLAN_REFACTOR_MOVE_IDEA_CONTENT_COMMAND,
    REQLAN_SEARCH_REFERENCE_COMMAND,
    ReqlanCodeActionProvider,
    resolveReferenceSearchSiteFromDocument,
    sharedNameCatalog,
    type NameCatalog
} from '@reqlan/language';

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
    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
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
        expect(titles).toContain(`Search for idea to replace 'shared_idea'…`);
        expect(titles).toContain(`Create 'shared_idea' in a new file and import it…`);

        const addImport = actions.find(action => action.title.includes('Add import from'));
        expect(addImport?.edit?.changes?.[document.textDocument.uri]?.[0]?.newText)
            .toContain('from "../lib/shared.rq" import shared_idea');
        expect(addImport?.isPreferred).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
    test('search and create actions invoke extension commands', async () => {
        const document = await parse(s`
            consumer {
                [missing_target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = collectImportErrorCodeActions(provider, document).filter(isCodeAction);

        const search = actions.find(action => action.title.startsWith('Search for idea'));
        expect(search?.command?.command).toBe(REQLAN_SEARCH_REFERENCE_COMMAND);
        // Args are resolved in the extension host from the active editor so VS Code
        // does not dispose a cached delegating command on code-action refresh.
        expect(search?.command?.arguments).toBeUndefined();

        const create = actions.find(action => action.title.startsWith('Create'));
        expect(create?.command?.command).toBe(REQLAN_IMPORT_ERROR_CREATE_COMMAND);
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('offers search code action when cursor is inside a resolved reference', async () => {
        const document = await parse(s`
            alpha {
                target idea
            }
            consumer {
                See [alpha] for details.
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const text = document.textDocument.getText();
        const refOffset = text.indexOf('[alpha]') + 2;
        const position = document.textDocument.positionAt(refOffset);
        const site = findIdeaReferenceAtPosition(document, position);
        expect(site?.refText).toBe('alpha');

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = provider.getCodeActions(document, {
            textDocument: { uri: document.textDocument.uri },
            range: { start: position, end: position },
            context: { diagnostics: [] }
        }).filter(isCodeAction);

        const search = actions.find(action => action.title.includes('Search for idea'));
        expect(search?.command?.command).toBe(REQLAN_SEARCH_REFERENCE_COMMAND);
        expect(search?.command?.arguments).toBeUndefined();
        expect(search?.title).toContain('alpha');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('offers wrap code action for a prose selection', async () => {
        const document = await parse(s`
            consumer {
                Turn showcase into a reference later.
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const text = document.textDocument.getText();
        const start = text.indexOf('showcase');
        const end = start + 'showcase'.length;
        const range = {
            start: document.textDocument.positionAt(start),
            end: document.textDocument.positionAt(end)
        };

        const site = findReferenceSearchSite(document, range);
        expect(site?.mode).toBe('wrap');
        expect(site?.refText).toBe('showcase');
        expect(site?.context?.ideaName).toBe('consumer');
        expect(site?.context?.target).toBe('showcase');
        expect(site?.context?.before).toContain('Turn ');
        expect(site?.context?.after).toContain(' into a reference');

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = provider.getCodeActions(document, {
            textDocument: { uri: document.textDocument.uri },
            range,
            context: { diagnostics: [] }
        }).filter(isCodeAction);

        const wrap = actions.find(action => action.title.includes('Wrap'));
        expect(wrap?.command?.command).toBe(REQLAN_SEARCH_REFERENCE_COMMAND);
        expect(wrap?.command?.arguments).toBeUndefined();
        expect(wrap?.title).toContain('showcase');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('wraps the word under the cursor when selection is empty', async () => {
        const document = await parse(s`
            consumer {
                Mention showcase in prose.
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const text = document.textDocument.getText();
        const offset = text.indexOf('showcase') + 3;
        const position = document.textDocument.positionAt(offset);
        const site = findReferenceSearchSite(document, { start: position, end: position });
        expect(site?.mode).toBe('wrap');
        expect(site?.refText).toBe('showcase');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('findIdeaReferenceAtPosition locates wiki-link targets', async () => {
        const document = await parse(s`
            alpha {
                body
            }
            consumer {
                See [[alpha|Alias]] here.
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const text = document.textDocument.getText();
        const refOffset = text.indexOf('[[alpha') + 3;
        const site = findIdeaReferenceAtPosition(
            document,
            document.textDocument.positionAt(refOffset)
        );
        expect(site?.refText).toBe('alpha');
        expect(site?.kind).toBe('wikilink');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('resolveReferenceSearchSiteFromDocument returns replace inside a bracket reference', async () => {
        const document = await parse(s`
            alpha {
                target idea
            }
            consumer {
                See [alpha] for details.
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const text = document.textDocument.getText();
        const refOffset = text.indexOf('[alpha]') + 2;
        const position = document.textDocument.positionAt(refOffset);
        const resolved = resolveReferenceSearchSiteFromDocument(
            document.textDocument.uri,
            document,
            { start: position, end: position }
        );
        expect(resolved?.mode).toBe('replace');
        expect(resolved?.refText).toBe('alpha');
        expect(resolved?.documentUri).toBe(document.textDocument.uri);
        expect(resolved?.context?.target).toContain('alpha');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('resolveReferenceSearchSiteFromDocument returns wrap on a prose word', async () => {
        const document = await parse(s`
            consumer {
                Mention showcase in prose.
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const text = document.textDocument.getText();
        const offset = text.indexOf('showcase') + 3;
        const position = document.textDocument.positionAt(offset);
        const resolved = resolveReferenceSearchSiteFromDocument(
            document.textDocument.uri,
            document,
            { start: position, end: position }
        );
        expect(resolved?.mode).toBe('wrap');
        expect(resolved?.refText).toBe('showcase');
        expect(resolved?.context?.ideaName).toBe('consumer');
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
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

describe('Idea refactor code actions', () => {
    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_delete]
    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
    // rq:["../../../reqlan rq/extension/vsc-primitives.rq".code_actions]
    test('offers move and delete actions at an idea declaration', async () => {
        const document = await parse(s`
            alpha {
                body
            }
            beta {
                see [alpha]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const text = document.textDocument.getText();
        const nameOffset = text.indexOf('alpha');
        const position = document.textDocument.positionAt(nameOffset);
        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = provider.getCodeActions(document, {
            textDocument: { uri: document.textDocument.uri },
            range: { start: position, end: position },
            context: { diagnostics: [] }
        }).filter(isCodeAction);

        const deleteAction = actions.find(action => action.title.includes('Delete idea'));
        expect(deleteAction?.command?.command).toBe(REQLAN_REFACTOR_DELETE_IDEA_COMMAND);
        expect(deleteAction?.command?.arguments?.[0]).toMatchObject({
            documentUri: document.textDocument.uri,
            ideaName: 'alpha'
        });

        const moveAction = actions.find(action => action.title.includes("Move idea 'alpha' to another file"));
        expect(moveAction?.command?.command).toBe(REQLAN_REFACTOR_MOVE_IDEA_COMMAND);
        expect(moveAction?.command?.arguments?.[0]).toMatchObject({
            documentUri: document.textDocument.uri,
            ideaName: 'alpha'
        });

        const moveContentAction = actions.find(action => action.title.includes("Move idea 'alpha' content"));
        expect(moveContentAction?.command?.command).toBe(REQLAN_REFACTOR_MOVE_IDEA_CONTENT_COMMAND);
        expect(moveContentAction?.command?.arguments?.[0]).toMatchObject({
            documentUri: document.textDocument.uri,
            ideaName: 'alpha'
        });
    });
});

describe('File-based barrel page code action', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
    // rq:["../../../reqlan rq/extension/features-commands.rq".file_based_code_actions]
    test('offers barrel page source action when the file has top-level ideas', async () => {
        const document = await parse(s`
            alpha {
                a
            }
            beta {
                b
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        expect(REQLAN_BARREL_PAGE_COMMAND).toBe('reqlan.barrelPage');
        expect(REQLAN_BARREL_PAGE_KIND).toBe('source.barrelPage');

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const actions = provider.getCodeActions(document, {
            textDocument: { uri: document.textDocument.uri },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            context: { diagnostics: [] }
        }).filter(isCodeAction);

        const barrel = actions.find(action => action.title.includes('Barrel page'));
        expect(barrel).toBeDefined();
        expect(barrel?.title).toBe('Barrel page into container…');
        expect(barrel?.command?.command).toBe(REQLAN_BARREL_PAGE_COMMAND);
        expect(barrel?.command?.arguments).toBeUndefined();
        expect(barrel?.kind).toBe(REQLAN_BARREL_PAGE_KIND);
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
    // rq:["../../../reqlan rq/extension/features-commands.rq".file_based_code_actions]
    test('omits barrel page when only quickfix is requested or there are no ideas', async () => {
        const withIdeas = await parseUri(s`
            alpha {
                a
            }
        `, 'file:///workspace/barrel/with-ideas.rq');
        const empty = await parseUri(s`
            import "./x.rq" as x
        `, 'file:///workspace/barrel/empty.rq');
        await services.shared.workspace.DocumentBuilder.build([withIdeas, empty], { validation: false });

        const provider = services.Reqlan.lsp.CodeActionProvider as ReqlanCodeActionProvider;
        const quickFixOnly = provider.getCodeActions(withIdeas, {
            textDocument: { uri: withIdeas.textDocument.uri },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            context: { diagnostics: [], only: ['quickfix'] }
        }).filter(isCodeAction);
        expect(quickFixOnly.some(action => action.command?.command === REQLAN_BARREL_PAGE_COMMAND)).toBe(false);

        const sourceOnly = provider.getCodeActions(withIdeas, {
            textDocument: { uri: withIdeas.textDocument.uri },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            context: { diagnostics: [], only: ['source'] }
        }).filter(isCodeAction);
        expect(sourceOnly.some(action => action.command?.command === REQLAN_BARREL_PAGE_COMMAND)).toBe(true);

        const noIdeas = provider.getCodeActions(empty, {
            textDocument: { uri: empty.textDocument.uri },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            context: { diagnostics: [] }
        }).filter(isCodeAction);
        expect(noIdeas.some(action => action.command?.command === REQLAN_BARREL_PAGE_COMMAND)).toBe(false);
    });
});

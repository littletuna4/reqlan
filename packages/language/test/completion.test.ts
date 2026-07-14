import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model } from 'reqlan-language';
import {
    createReqlanServices,
    getAttributeKeyContext,
    getCompletionSite,
    isInMainDescriptionProse,
    ReqlanCompletionProvider,
    sharedAttributeCatalog,
    type AttributeCatalog
} from 'reqlan-language';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const exampleDir = join(repoDir, 'example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

afterEach(async () => {
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
        clearDocuments(services.shared, documents);
    }
    document = undefined;
    sharedAttributeCatalog.reset();
});

async function parseDocumentsTogether(filenames: string[]): Promise<LangiumDocument<Model>[]> {
    const documents: LangiumDocument<Model>[] = [];
    for (const filename of filenames) {
        const path = join(exampleDir, filename);
        const uri = URI.parse(pathToFileURL(path).href);
        const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(path, 'utf8'),
            uri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(doc);
        documents.push(doc);
    }
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: false });
    return documents;
}

describe('Completion', () => {
    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".attribute_code_completion_main_descriptiption]
    test('suppresses completion in main description prose', async () => {
        document = await parse(`demo {
            This is main description prose.
            @tags (todo)
        }`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        expect(isInMainDescriptionProse(document, { line: 1, character: 10 })).toBe(true);
        expect(getCompletionSite(document, { line: 1, character: 10 })).toBe('main_description');

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 10 }
        });
        expect(result?.items ?? []).toEqual([]);
    });

    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
    test('completes attribute keys after @ at line start', async () => {
        document = await parse(`demo {
            @ta
        }`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        expect(getCompletionSite(document, { line: 1, character: 15 })).toBe('attribute_key');
        const keyContext = getAttributeKeyContext(document, { line: 1, character: 15 });
        expect(keyContext?.prefix).toBe('ta');

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 15 }
        });
        const labels = (result?.items ?? []).map(item => item.label);
        expect(labels).toContain('tags');
    });

    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
    test('completes attribute values from workspace and index catalog', async () => {
        document = await parse(`demo {
            @status don
        }
        other {
            @status done
        }`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const catalog: AttributeCatalog = {
            keys: ['status'],
            valuesByKey: { status: ['done', 'draft'] }
        };
        sharedAttributeCatalog.update(catalog);

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 21 }
        });
        const labels = (result?.items ?? []).map(item => item.label);
        expect(labels).toContain('done');
    });

    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".reference_code_completion]
    test('completes idea names for bracket references', async () => {
        document = await parse(`demo {
            see [my
        }
        my {
            target
        }`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 19 }
        });
        const labels = (result?.items ?? []).map(item => item.label);
        expect(labels).toContain('my');
    });

    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".reference_code_completion_sequencing]
    test('orders reference completions by distance then alphabetically', async () => {
        document = await parse(`hub {
            see [a_near]
            see [z_near]
            see [
        }
        a_near {
            links [far_idea]
        }
        z_near {
            sibling
        }
        far_idea {
            distant
        }
        orphan_alpha {
            disconnected
        }
        orphan_zeta {
            also disconnected
        }`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 3, character: 17 }
        });
        const labels = (result?.items ?? []).map(item => String(item.label));
        expect(labels).toEqual([
            'hub',
            'a_near',
            'z_near',
            'far_idea',
            'orphan_alpha',
            'orphan_zeta'
        ]);
        const sortTexts = (result?.items ?? []).map(item => item.sortText);
        expect(sortTexts[0]).toBe('0000_hub');
        expect(sortTexts[1]).toBe('0001_a_near');
        expect(sortTexts[2]).toBe('0001_z_near');
        expect(sortTexts[3]).toBe('0002_far_idea');
    });

    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".reference_code_completion]
    test('completes relative import paths', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const documents = await parseDocumentsTogether(['sub idea.rq', 'exampleimport.rq']);
        document = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));
        expect(document).toBeDefined();
        if (!document) {
            return;
        }

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 10 }
        });
        const labels = (result?.items ?? []).map(item => item.label);
        expect(labels.some(label => String(label).includes('exampleimport'))).toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('completes import-root alias paths', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const workspaceUri = URI.parse(pathToFileURL(exampleDir).href);
        services.shared.workspace.WorkspaceManager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'example', uri: workspaceUri.toString() }]
        });
        await parseDocumentsTogether(['exampleimport.rq']);
        const importerUri = URI.parse(pathToFileURL(join(exampleDir, 'alias-completion.rq')).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            'import "@',
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 0, character: 8 }
        });
        const labels = (result?.items ?? []).map(item => String(item.label));
        expect(labels.some(label => label.startsWith('@/') && label.includes('exampleimport'))).toBe(true);
    });
});

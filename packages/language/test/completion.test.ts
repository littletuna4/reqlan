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
            @tags: (todo)
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
            @status: don
        }
        other {
            @status: done
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
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model } from '@reqlan/language';
import {
    clearPathCompletionCaches,
    createReqlanServices,
    getAnonymousImportPathContext,
    getAttributeKeyContext,
    getCompletionSite,
    isInMainDescriptionProse,
    ReqlanCompletionProvider,
    sharedAttributeCatalog,
    type AttributeCatalog
} from '@reqlan/language';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const exampleDir = join(repoDir, 'example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;
let tempDirs: string[] = [];

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
    clearPathCompletionCaches();
    for (const dir of tempDirs) {
        rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
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

function createTempWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'reqlan-completion-'));
    tempDirs.push(dir);
    return dir;
}

/** Add a document under `root` and build every loaded document so cross-file candidates resolve. */
async function addWorkspaceDocument(
    root: string,
    fileName: string,
    content: string
): Promise<LangiumDocument<Model>> {
    writeFileSync(join(root, fileName), content);
    const uri = URI.parse(pathToFileURL(join(root, fileName)).href);
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString(content, uri) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(doc);
    await services.shared.workspace.DocumentBuilder.build(
        services.shared.workspace.LangiumDocuments.all.toArray(),
        { validation: false }
    );
    return doc;
}

describe('Completion', () => {
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".attribute_code_completion_main_descriptiption]
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

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
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

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
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

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion]
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

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_rendering]
    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_auto_file_import]
    test('reference completions show source path and auto-import edits for other files', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        await parseDocumentsTogether(['exampleimport.rq']);

        const content = 'consumer {\n    see [\n}';
        const consumerUri = URI.parse(pathToFileURL(join(exampleDir, 'consumer-completion.rq')).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            consumerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 9 }
        });
        const remote = (result?.items ?? []).find(item => item.label === 'myimportableIdea');
        expect(remote).toBeDefined();
        expect(remote?.detail).toBe('./exampleimport.rq');
        expect(remote?.additionalTextEdits).toEqual([
            {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                newText: 'from "./exampleimport.rq" import myimportableIdea\n\n'
            }
        ]);

        const local = (result?.items ?? []).find(item => item.label === 'consumer');
        expect(local).toBeDefined();
        expect(local?.detail).toBeUndefined();
        expect(local?.additionalTextEdits).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_auto_file_import]
    test('skips auto-import edit when the idea is already imported', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        await parseDocumentsTogether(['exampleimport.rq']);

        const content = 'from "./exampleimport.rq" import myimportableIdea\n\nconsumer {\n    see [\n}';
        const consumerUri = URI.parse(pathToFileURL(join(exampleDir, 'consumer-already-imported.rq')).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            consumerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 3, character: 9 }
        });
        const remote = (result?.items ?? []).find(item => item.label === 'myimportableIdea');
        expect(remote?.detail).toBe('./exampleimport.rq');
        expect(remote?.additionalTextEdits).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_sequencing]
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

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_explicit_extension]
    test('completes relative import paths with explicit .rq', async () => {
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
        const labels = (result?.items ?? []).map(item => String(item.label));
        expect(labels.some(label => label.includes('exampleimport.rq'))).toBe(true);
        expect(labels.some(label => label === './exampleimport' || label === 'exampleimport')).toBe(false);
    });

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    // rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_explicit_extension]
    test('completes import-root alias paths with explicit .rq', async () => {
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
        expect(labels.some(label => label.startsWith('@/') && label.endsWith('exampleimport.rq'))).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_path_segments]
    test('shows next path segments in a folder context', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        const nested = join(root, 'lang');
        mkdirSync(nested);
        writeFileSync(join(nested, 'near.rq'), 'near {}\n');
        writeFileSync(join(nested, 'notes.md'), '# notes\n');
        mkdirSync(join(nested, 'sub'));
        const importerPath = join(root, 'importer.rq');
        const content = 'import "./lang/"';
        writeFileSync(importerPath, content);
        const importerUri = URI.parse(pathToFileURL(importerPath).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        // Cursor on closing quote so the typed prefix includes the trailing `/`.
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 0, character: content.length - 1 }
        });
        const labels = (result?.items ?? []).map(item => String(item.label));
        expect(labels).toContain('./lang/near.rq');
        expect(labels).toContain('./lang/sub/');
        expect(labels.some(label => label.includes('notes.md'))).toBe(false);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_path_segments]
    test('ranks directory segments before nested files under the same folder', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        const pathDir = join(root, 'path');
        mkdirSync(pathDir);
        writeFileSync(join(pathDir, 'file.rq'), 'nested {}\n');
        const importerPath = join(root, 'deep', 'importer.rq');
        mkdirSync(join(root, 'deep'), { recursive: true });
        const content = 'import "../"';
        writeFileSync(importerPath, content);
        const fileUri = URI.parse(pathToFileURL(join(pathDir, 'file.rq')).href);
        services.shared.workspace.LangiumDocuments.addDocument(
            services.shared.workspace.LangiumDocumentFactory.fromString('nested {}\n', fileUri) as LangiumDocument<Model>
        );
        const importerUri = URI.parse(pathToFileURL(importerPath).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build(
            services.shared.workspace.LangiumDocuments.all.toArray(),
            { validation: false }
        );

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 0, character: content.length - 1 }
        });
        const items = (result?.items ?? [])
            .filter(item => String(item.label) === '../path/' || String(item.label) === '../path/file.rq');
        expect(items.map(item => String(item.label))).toEqual(['../path/', '../path/file.rq']);
        expect(items.every(item => item.filterText === '../')).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_substring_match]
    test('matches import paths by substring search not only prefix', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        mkdirSync(join(root, 'parent'), { recursive: true });
        writeFileSync(join(root, 'parent', 'path.rq'), 'target {}\n');
        mkdirSync(join(root, 'hello', 'inbetween', 'path'), { recursive: true });
        writeFileSync(join(root, 'hello', 'inbetween', 'path', 'file.rq'), 'deep {}\n');
        const importerPath = join(root, 'a', 'b', 'importer.rq');
        mkdirSync(join(root, 'a', 'b'), { recursive: true });
        const content = 'import "path"';
        writeFileSync(importerPath, content);
        for (const path of [
            join(root, 'parent', 'path.rq'),
            join(root, 'hello', 'inbetween', 'path', 'file.rq')
        ]) {
            const uri = URI.parse(pathToFileURL(path).href);
            services.shared.workspace.LangiumDocuments.addDocument(
                services.shared.workspace.LangiumDocumentFactory.fromString(
                    readFileSync(path, 'utf8'),
                    uri
                ) as LangiumDocument<Model>
            );
        }
        const importerUri = URI.parse(pathToFileURL(importerPath).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build(
            services.shared.workspace.LangiumDocuments.all.toArray(),
            { validation: false }
        );

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const pathResult = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 0, character: content.length - 1 }
        });
        const pathLabels = (pathResult?.items ?? []).map(item => String(item.label));
        expect(pathLabels.some(label => label.endsWith('parent/path.rq') || label.includes('/parent/path.rq'))).toBe(true);

        const helloContent = 'import "hellopath"';
        const helloDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            helloContent,
            URI.parse(pathToFileURL(join(root, 'a', 'b', 'hello-importer.rq')).href)
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(helloDoc);
        await services.shared.workspace.DocumentBuilder.build([helloDoc], { validation: false });
        const helloResult = await provider.getCompletion(helloDoc, {
            textDocument: { uri: helloDoc.textDocument.uri },
            position: { line: 0, character: helloContent.length - 1 }
        });
        const helloLabels = (helloResult?.items ?? []).map(item => String(item.label));
        expect(helloLabels.some(label => label.includes('hello/inbetween/path/file.rq'))).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_ranking]
    test('ranks import path completions by proximity then alphabetically', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        const mid = join(root, 'a', 'b', 'c');
        mkdirSync(mid, { recursive: true });
        writeFileSync(join(root, 'a', 'b', 'close.rq'), 'close {}\n');
        writeFileSync(join(root, 'far.rq'), 'far {}\n');
        writeFileSync(join(root, 'a', 'b', 'alpha.rq'), 'alpha {}\n');
        writeFileSync(join(root, 'a', 'b', 'zeta.rq'), 'zeta {}\n');
        const importerPath = join(mid, 'importer.rq');
        const content = 'import "../"';
        writeFileSync(importerPath, content);
        for (const path of [
            join(root, 'a', 'b', 'close.rq'),
            join(root, 'far.rq'),
            join(root, 'a', 'b', 'alpha.rq'),
            join(root, 'a', 'b', 'zeta.rq')
        ]) {
            const uri = URI.parse(pathToFileURL(path).href);
            const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
                readFileSync(path, 'utf8'),
                uri
            ) as LangiumDocument<Model>;
            services.shared.workspace.LangiumDocuments.addDocument(doc);
        }
        const importerUri = URI.parse(pathToFileURL(importerPath).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build(
            services.shared.workspace.LangiumDocuments.all.toArray(),
            { validation: false }
        );

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 0, character: content.length - 1 }
        });
        const items = result?.items ?? [];
        const closeIndex = items.findIndex(item => item.label === '../close.rq');
        const farIndex = items.findIndex(item => item.label === '../../../far.rq');
        expect(closeIndex).toBeGreaterThanOrEqual(0);
        expect(farIndex).toBeGreaterThanOrEqual(0);
        // Returned order (not a post-hoc sortText re-sort) must put closer paths first.
        expect(closeIndex).toBeLessThan(farIndex);
        const close = items[closeIndex]!;
        const far = items[farIndex]!;
        expect(close.filterText).toBe('../');
        expect(far.filterText).toBe('../');
        expect(String(close.sortText).localeCompare(String(far.sortText))).toBeLessThan(0);
        // Alphabetically, ../../../far.rq would sort before ../close.rq — proximity must win.
        expect(String(far.label).localeCompare(String(close.label))).toBeLessThan(0);

        const alphaIndex = items.findIndex(item => item.label === '../alpha.rq');
        const zetaIndex = items.findIndex(item => item.label === '../zeta.rq');
        expect(alphaIndex).toBeGreaterThanOrEqual(0);
        expect(zetaIndex).toBeGreaterThanOrEqual(0);
        expect(alphaIndex).toBeLessThan(zetaIndex);
        expect(String(items[alphaIndex]!.sortText).localeCompare(String(items[zetaIndex]!.sortText))).toBeLessThan(0);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".anonymous_reference_code_completion]
    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion]
    test('anonymous file references share import path completion with .rq', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        await parseDocumentsTogether(['exampleimport.rq']);
        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;

        const anonContent = 'demo {\n    ["./"]\n}';
        const anonUri = URI.parse(pathToFileURL(join(exampleDir, 'anon-completion.rq')).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            anonContent,
            anonUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        const anonResult = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 8 }
        });

        const importContent = 'import "./"';
        const importUri = URI.parse(pathToFileURL(join(exampleDir, 'named-completion.rq')).href);
        const importDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            importContent,
            importUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(importDoc);
        await services.shared.workspace.DocumentBuilder.build([importDoc], { validation: false });
        const importResult = await provider.getCompletion(importDoc, {
            textDocument: { uri: importDoc.textDocument.uri },
            position: { line: 0, character: importContent.length - 1 }
        });

        const anonItem = (anonResult?.items ?? []).find(item => String(item.label) === './exampleimport.rq');
        const importItem = (importResult?.items ?? []).find(item => String(item.label) === './exampleimport.rq');
        expect(anonItem).toBeDefined();
        expect(importItem).toBeDefined();
        expect(anonItem?.sortText).toBe(importItem?.sortText);
        expect(anonItem?.filterText).toBe('./');
        expect(importItem?.filterText).toBe('./');
        const importRqLabels = (importResult?.items ?? [])
            .map(item => String(item.label))
            .filter(label => label.endsWith('.rq') && !label.includes('completion.rq'))
            .sort();
        const anonRqLabels = (anonResult?.items ?? [])
            .map(item => String(item.label))
            .filter(label => label.endsWith('.rq'))
            .sort();
        for (const label of importRqLabels) {
            expect(anonRqLabels).toContain(label);
        }
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".anonymous_reference_code_completion]
    test('anonymous qualified reference paths use shared import path completion', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        await parseDocumentsTogether(['exampleimport.rq']);
        const content = 'demo {\n    ["./exampleimport.rq".myimportableIdea]\n}';
        const importerUri = URI.parse(pathToFileURL(join(exampleDir, 'anon-qualified-completion.rq')).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        // Inside the anonymous path string (after `"./`).
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 8 }
        });
        const labels = (result?.items ?? []).map(item => String(item.label));
        expect(labels.some(label => label.includes('exampleimport.rq'))).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".anonymous_reference_code_completion]
    test('incomplete anonymous alias paths complete like import alias paths', async () => {
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

        const importUri = URI.parse(pathToFileURL(join(exampleDir, 'anon-import-open.rq')).href);
        const importDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            'import "@',
            importUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(importDoc);

        const anonUri = URI.parse(pathToFileURL(join(exampleDir, 'anon-bracket-open.rq')).href);
        const anonDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            'consumer {\n    see ["@\n}',
            anonUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(anonDoc);
        await services.shared.workspace.DocumentBuilder.build([importDoc, anonDoc], { validation: false });

        expect(getCompletionSite(anonDoc, { line: 1, character: 11 })).toBe('anonymous_import_path');
        expect(getAnonymousImportPathContext(anonDoc, { line: 1, character: 11 })?.prefix).toBe('@');
        expect(isInMainDescriptionProse(anonDoc, { line: 1, character: 11 })).toBe(false);

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const importLabels = ((await provider.getCompletion(importDoc, {
            textDocument: { uri: importDoc.textDocument.uri },
            position: { line: 0, character: 8 }
        }))?.items ?? []).map(item => String(item.label));
        const anonLabels = ((await provider.getCompletion(anonDoc, {
            textDocument: { uri: anonDoc.textDocument.uri },
            position: { line: 1, character: 11 }
        }))?.items ?? []).map(item => String(item.label));

        expect(anonLabels.length).toBeGreaterThan(0);
        expect(anonLabels.every(label => label.startsWith('@/'))).toBe(true);
        expect(anonLabels.some(label => label.endsWith('exampleimport.rq'))).toBe(true);

        // Import paths stay .rq-only. Anonymous file references may also list other files.
        const importAliasLabels = importLabels.filter(
            label => label.startsWith('@/') && label.endsWith('.rq') && !label.includes('-open.rq')
        );
        for (const label of importAliasLabels) {
            expect(anonLabels).toContain(label);
        }
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
    test('anonymous file references complete code files, folders, and .rq files', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        writeFileSync(join(root, 'lib.rq'), 'exported {}\n');
        writeFileSync(join(root, 'util.ts'), 'export const x = 1;\n');
        mkdirSync(join(root, 'assets'));
        writeFileSync(join(root, 'assets', 'notes.md'), '# notes\n');
        const importerPath = join(root, 'app.rq');
        const anonContent = 'host {\n    see ["./"]\n}';
        writeFileSync(importerPath, anonContent);
        const libUri = URI.parse(pathToFileURL(join(root, 'lib.rq')).href);
        services.shared.workspace.LangiumDocuments.addDocument(
            services.shared.workspace.LangiumDocumentFactory.fromString('exported {}\n', libUri) as LangiumDocument<Model>
        );
        const importerUri = URI.parse(pathToFileURL(importerPath).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            anonContent,
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build(
            services.shared.workspace.LangiumDocuments.all.toArray(),
            { validation: false }
        );

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const anonResult = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 12 }
        });
        const anonLabels = (anonResult?.items ?? []).map(item => String(item.label));
        expect(anonLabels).toContain('./lib.rq');
        expect(anonLabels).toContain('./util.ts');
        expect(anonLabels).toContain('./assets/');
        expect(anonLabels).toContain('./assets/notes.md');

        const importContent = 'import "./"';
        const importDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            importContent,
            URI.parse(pathToFileURL(join(root, 'importer.rq')).href)
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(importDoc);
        await services.shared.workspace.DocumentBuilder.build([importDoc], { validation: false });
        const importResult = await provider.getCompletion(importDoc, {
            textDocument: { uri: importDoc.textDocument.uri },
            position: { line: 0, character: importContent.length - 1 }
        });
        const importLabels = (importResult?.items ?? []).map(item => String(item.label));
        expect(importLabels).toContain('./lib.rq');
        expect(importLabels).toContain('./assets/');
        expect(importLabels.some(label => label.endsWith('util.ts'))).toBe(false);
        expect(importLabels.some(label => label.endsWith('notes.md'))).toBe(false);
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
    test('completes ideas and ideasets after a quoted file path', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        const libContent = `exported {
    body
}
bundle (
    exported
)
`;
        writeFileSync(join(root, 'lib.rq'), libContent);
        const appContent = 'host {\n    see ["./lib.rq".\n}';
        writeFileSync(join(root, 'app.rq'), appContent);
        const libUri = URI.parse(pathToFileURL(join(root, 'lib.rq')).href);
        services.shared.workspace.LangiumDocuments.addDocument(
            services.shared.workspace.LangiumDocumentFactory.fromString(libContent, libUri) as LangiumDocument<Model>
        );
        const appUri = URI.parse(pathToFileURL(join(root, 'app.rq')).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            appContent,
            appUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build(
            services.shared.workspace.LangiumDocuments.all.toArray(),
            { validation: false }
        );

        expect(getCompletionSite(document, { line: 1, character: 20 })).toBe('qualified_file_idea');
        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 20 }
        });
        const labels = (result?.items ?? []).map(item => String(item.label));
        expect(labels).toContain('exported');
        expect(labels).toContain('bundle');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
    test('completes ideaset members after a dotted qualifier', async () => {
        document = await parse(`host {
    see [bundle.
}
bundle (
    exported,
    other_member
)
exported {
    body
}
other_member {
    body
}`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 17 }
        });
        const labels = (result?.items ?? []).map(item => String(item.label));
        expect(labels).toContain('bundle.exported');
        expect(labels).toContain('bundle.other_member');
        expect(labels).not.toContain('host');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
    test('completes attribute values after the colon form', async () => {
        document = await parse(`demo {
            @status: don
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
            position: { line: 1, character: 24 }
        });
        const labels = (result?.items ?? []).map(item => item.label);
        expect(labels).toContain('done');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".completion_site_identifier_charset]
    test('completes hyphenated reference names', async () => {
        document = await parse(`demo {
    see [my-
}
my-idea {
    @my-ke
    target
}`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        sharedAttributeCatalog.update({ keys: ['my-key'], valuesByKey: {} });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const referenceResult = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 12 }
        });
        const referenceLabels = (referenceResult?.items ?? []).map(item => String(item.label));
        expect(referenceLabels).toContain('my-idea');

        expect(getCompletionSite(document, { line: 4, character: 10 })).toBe('attribute_key');
        const keyResult = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 4, character: 10 }
        });
        const keyLabels = (keyResult?.items ?? []).map(item => String(item.label));
        expect(keyLabels).toContain('my-key');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".completion_site_identifier_charset]
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
    test('completes hyphenated names after a quoted file path', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        const libContent = 'my-idea {\n    body\n}\n';
        writeFileSync(join(root, 'lib.rq'), libContent);
        const appContent = 'host {\n    see ["./lib.rq".my-\n}';
        writeFileSync(join(root, 'app.rq'), appContent);
        const libUri = URI.parse(pathToFileURL(join(root, 'lib.rq')).href);
        services.shared.workspace.LangiumDocuments.addDocument(
            services.shared.workspace.LangiumDocumentFactory.fromString(libContent, libUri) as LangiumDocument<Model>
        );
        const appUri = URI.parse(pathToFileURL(join(root, 'app.rq')).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            appContent,
            appUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build(
            services.shared.workspace.LangiumDocuments.all.toArray(),
            { validation: false }
        );

        expect(getCompletionSite(document, { line: 1, character: 23 })).toBe('qualified_file_idea');
        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 23 }
        });
        const labels = (result?.items ?? []).map(item => String(item.label));
        expect(labels).toContain('my-idea');
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_match_quality]
    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_ranking]
    test('ranks exact substring matches above subsequence matches', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        mkdirSync(join(root, 'a', 'b'), { recursive: true });
        writeFileSync(join(root, 'a', 'b', 'n-a-t-c-h.rq'), 'near {}\n');
        mkdirSync(join(root, 'a', 'b', 'zz', 'zz'), { recursive: true });
        writeFileSync(join(root, 'a', 'b', 'zz', 'zz', 'natch.rq'), 'target {}\n');
        const importerPath = join(root, 'a', 'b', 'importer.rq');
        const content = 'import "natch"';
        writeFileSync(importerPath, content);
        const importerUri = URI.parse(pathToFileURL(importerPath).href);
        document = services.shared.workspace.LangiumDocumentFactory.fromString(
            content,
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build(
            services.shared.workspace.LangiumDocuments.all.toArray(),
            { validation: false }
        );

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 0, character: content.length - 1 }
        });
        const items = (result?.items ?? []).map(item => ({
            label: String(item.label),
            sortText: String(item.sortText)
        }));
        // The subsequence match sits next to the importer; the exact match is two hops away.
        const subsequence = items.find(item => item.label.endsWith('n-a-t-c-h.rq'));
        const exact = items.find(item => item.label.endsWith('natch.rq'));
        expect(subsequence).toBeDefined();
        expect(exact).toBeDefined();
        expect(exact!.sortText.localeCompare(subsequence!.sortText)).toBeLessThan(0);
        expect(items.findIndex(item => item.label.endsWith('natch.rq')))
            .toBeLessThan(items.findIndex(item => item.label.endsWith('n-a-t-c-h.rq')));
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
    test('completing inside a string replaces the tail', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        mkdirSync(join(root, 'root', 'autocompletecontexthere', 'hello'), { recursive: true });
        writeFileSync(join(root, 'root', 'autocompletecontexthere', 'hello', 'afile.ts'), 'export {};\n');
        mkdirSync(join(root, 'a', 'b'), { recursive: true });
        writeFileSync(join(root, 'a', 'b', 'c.ts'), 'export {};\n');
        services.shared.workspace.WorkspaceManager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'root', uri: URI.parse(pathToFileURL(root).href).toString() }]
        });

        const tailLine = '    see ["@/root/autocompletecontexthere/afile.ts"]';
        document = await addWorkspaceDocument(root, 'app.rq', `demo {\n${tailLine}\n}`);
        const cursor = { line: 1, character: tailLine.indexOf('/afile.ts') };
        expect(getCompletionSite(document, cursor)).toBe('anonymous_import_path');
        expect(getAnonymousImportPathContext(document, cursor)?.prefix).toBe('@/root/autocompletecontexthere');

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: cursor
        });
        const item = (result?.items ?? [])
            .find(entry => entry.label === '@/root/autocompletecontexthere/hello/afile.ts');
        expect(item).toBeDefined();
        const edit = item?.textEdit;
        expect(edit).toBeDefined();
        if (!edit || !('range' in edit)) {
            return;
        }
        // The range runs from the string content up to the closing quote, so the tail is consumed.
        expect(edit.range.start).toEqual({ line: 1, character: tailLine.indexOf('@') });
        expect(edit.range.end).toEqual({ line: 1, character: tailLine.length - 2 });
        expect(tailLine.slice(0, edit.range.start.character) + edit.newText + tailLine.slice(edit.range.end.character))
            .toBe('    see ["@/root/autocompletecontexthere/hello/afile.ts"]');

        // A typed prefix that continues into the tail: `@/a/` plus `@/a/b/` yields `@/a/b/c.ts`.
        const mergeLine = '    see ["@/a/b/c.ts"]';
        document = await addWorkspaceDocument(root, 'merge.rq', `demo {\n${mergeLine}\n}`);
        const mergeCursor = { line: 1, character: mergeLine.indexOf('b/c.ts') };
        const mergeResult = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: mergeCursor
        });
        const mergeItem = (mergeResult?.items ?? []).find(entry => entry.label === '@/a/b/');
        expect(mergeItem).toBeDefined();
        const mergeEdit = mergeItem?.textEdit;
        if (!mergeEdit || !('range' in mergeEdit)) {
            return;
        }
        expect(mergeEdit.newText).toBe('@/a/b/c.ts');
        expect(mergeLine.slice(0, mergeEdit.range.start.character) + mergeEdit.newText
            + mergeLine.slice(mergeEdit.range.end.character))
            .toBe('    see ["@/a/b/c.ts"]');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
    test('picking a folder carries a bare filename tail', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        mkdirSync(join(root, 'a'), { recursive: true });
        writeFileSync(join(root, 'a', 'c.ts'), 'export {};\n');
        mkdirSync(join(root, 'a', 'd'), { recursive: true });
        services.shared.workspace.WorkspaceManager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'root', uri: URI.parse(pathToFileURL(root).href).toString() }]
        });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;

        // A bare file name after the cursor is the file being completed: the folder insert keeps it.
        const carryLine = '    see ["@/a/c.ts"]';
        document = await addWorkspaceDocument(root, 'carry.rq', `demo {\n${carryLine}\n}`);
        const carryCursor = { line: 1, character: carryLine.indexOf('c.ts') };
        const carryResult = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: carryCursor
        });
        const carryItem = (carryResult?.items ?? []).find(entry => entry.label === '@/a/d/');
        expect(carryItem).toBeDefined();
        const carryEdit = carryItem?.textEdit;
        if (!carryEdit || !('range' in carryEdit)) {
            return;
        }
        expect(carryEdit.newText).toBe('@/a/d/c.ts');
        expect(carryLine.slice(0, carryEdit.range.start.character) + carryEdit.newText
            + carryLine.slice(carryEdit.range.end.character))
            .toBe('    see ["@/a/d/c.ts"]');

        // A tail with a separator is stale text: the folder insert consumes it.
        const dropLine = '    see ["@/a/b/c.ts"]';
        document = await addWorkspaceDocument(root, 'drop.rq', `demo {\n${dropLine}\n}`);
        const dropCursor = { line: 1, character: dropLine.indexOf('b/c.ts') };
        const dropResult = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: dropCursor
        });
        const dropItem = (dropResult?.items ?? []).find(entry => entry.label === '@/a/d/');
        expect(dropItem).toBeDefined();
        const dropEdit = dropItem?.textEdit;
        if (!dropEdit || !('range' in dropEdit)) {
            return;
        }
        expect(dropEdit.newText).toBe('@/a/d/');
        expect(dropLine.slice(0, dropEdit.range.start.character) + dropEdit.newText
            + dropLine.slice(dropEdit.range.end.character))
            .toBe('    see ["@/a/d/"]');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
    test('completing inside a reference name replaces the tail', async () => {
        services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        document = await parse(`demo {
    see [name_idea]
}
name_idea {
    body
}
name_idea_two {
    body
}`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const line = '    see [name_idea]';
        const cursor = { line: 1, character: 11 };
        expect(getCompletionSite(document, cursor)).toBe('reference');
        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: cursor
        });
        const items = result?.items ?? [];
        const replacement = items.find(entry => entry.label === 'name_idea_two');
        expect(replacement).toBeDefined();
        const edit = replacement?.textEdit;
        expect(edit).toBeDefined();
        if (!edit || !('range' in edit)) {
            return;
        }
        // The range ends at the closing `]`, so the rest of the name is replaced, not duplicated.
        expect(edit.range.start).toEqual({ line: 1, character: 9 });
        expect(edit.range.end).toEqual({ line: 1, character: 18 });
        expect(line.slice(0, edit.range.start.character) + edit.newText + line.slice(edit.range.end.character))
            .toBe('    see [name_idea_two]');

        // The typed prefix plus the tail spell the whole name, so the edit inserts nothing extra.
        const exact = items.find(entry => entry.label === 'name_idea');
        expect(exact?.textEdit?.newText).toBe('name_idea');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
    test('completes attribute value replacing the tail', async () => {
        document = await parse(`demo {
    @status: active
}`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        sharedAttributeCatalog.update({ keys: ['status'], valuesByKey: { status: ['done', 'active'] } });

        const line = '    @status: active';
        const cursor = { line: 1, character: 15 };
        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: cursor
        });
        const item = (result?.items ?? []).find(entry => entry.label === 'active');
        expect(item).toBeDefined();
        const edit = item?.textEdit;
        if (!edit || !('range' in edit)) {
            return;
        }
        // The range runs from the value start to the token end, so the tail is consumed.
        expect(edit.range.start).toEqual({ line: 1, character: 13 });
        expect(edit.range.end).toEqual({ line: 1, character: 19 });
        expect(line.slice(0, edit.range.start.character) + edit.newText + line.slice(edit.range.end.character))
            .toBe('    @status: active');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
    test('completes attribute key replacing the tail', async () => {
        document = await parse(`demo {
    @status: v
}`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        sharedAttributeCatalog.update({ keys: ['status'], valuesByKey: {} });

        const line = '    @status: v';
        const cursor = { line: 1, character: 8 };
        expect(getCompletionSite(document, cursor)).toBe('attribute_key');
        const keyContext = getAttributeKeyContext(document, cursor);
        expect(keyContext?.tail).toBe('tus');
        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: cursor
        });
        const item = (result?.items ?? []).find(entry => entry.label === 'status');
        expect(item).toBeDefined();
        const edit = item?.textEdit;
        if (!edit || !('range' in edit)) {
            return;
        }
        // The range runs from after `@` to the key word end, so the tail is consumed.
        expect(edit.range.start).toEqual({ line: 1, character: 5 });
        expect(edit.range.end).toEqual({ line: 1, character: 11 });
        expect(line.slice(0, edit.range.start.character) + edit.newText + line.slice(edit.range.end.character))
            .toBe('    @status: v');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_reentry_is_lossless]
    test('appends the closing quote at the end of an unclosed string', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        mkdirSync(join(root, 'a', 'b'), { recursive: true });
        writeFileSync(join(root, 'a', 'b', 'c.ts'), 'export {};\n');
        services.shared.workspace.WorkspaceManager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'root', uri: URI.parse(pathToFileURL(root).href).toString() }]
        });

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;

        // The string has no closer and the line ends after the cursor: the insert closes it.
        const openLine = '    see ["@/a/b';
        const openDoc = await addWorkspaceDocument(root, 'open.rq', `demo {\n${openLine}\n}`);
        const openCursor = { line: 1, character: openLine.length };
        const openResult = await provider.getCompletion(openDoc, {
            textDocument: { uri: openDoc.textDocument.uri },
            position: openCursor
        });
        const openItem = (openResult?.items ?? []).find(entry => entry.label === '@/a/b/c.ts');
        expect(openItem).toBeDefined();
        const openEdit = openItem?.textEdit;
        if (!openEdit || !('range' in openEdit)) {
            return;
        }
        expect(openEdit.newText).toBe('@/a/b/c.ts"');

        // In-progress text after the cursor (no closer, non-empty rest) is not quoted.
        const midLine = '    see ["@/a/bc.ts';
        const midDoc = await addWorkspaceDocument(root, 'mid.rq', `demo {\n${midLine}\n}`);
        const midCursor = { line: 1, character: midLine.indexOf('c.ts') };
        const midResult = await provider.getCompletion(midDoc, {
            textDocument: { uri: midDoc.textDocument.uri },
            position: midCursor
        });
        const midItem = (midResult?.items ?? []).find(entry => entry.label === '@/a/b/c.ts');
        expect(midItem).toBeDefined();
        const midEdit = midItem?.textEdit;
        if (!midEdit || !('range' in midEdit)) {
            return;
        }
        expect(midEdit.newText).toBe('@/a/b/c.ts');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_reentry_is_lossless]
    test('ranks the current value first when reentering a path', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        mkdirSync(join(root, 'a', 'b'), { recursive: true });
        writeFileSync(join(root, 'a', 'b', 'c.ts'), 'export {};\n');
        mkdirSync(join(root, 'a', 'z'), { recursive: true });
        writeFileSync(join(root, 'a', 'z', 'q.ts'), 'export {};\n');
        services.shared.workspace.WorkspaceManager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'root', uri: URI.parse(pathToFileURL(root).href).toString() }]
        });
        document = await addWorkspaceDocument(root, 'app.rq', 'demo {\n    ["@/a/b/c.ts"]\n}');
        const cursor = { line: 1, character: 9 };

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: cursor
        });
        const names = (result?.items ?? []).map(item => String(item.label));
        expect(names.indexOf('@/a/b/c.ts')).toBe(0);
        expect(names.indexOf('@/a/b/')).toBeGreaterThan(-1);
        expect(names.indexOf('@/a/z/q.ts')).toBeGreaterThan(-1);
        expect(names.indexOf('@/a/b/')).toBeLessThan(names.indexOf('@/a/z/q.ts'));
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_prefix_aware_ranking]
    test('ranks alias root candidates first for alias queries', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        mkdirSync(join(root, '@', 'x'), { recursive: true });
        writeFileSync(join(root, '@', 'x', 'near.rq'), 'export {};\n');
        mkdirSync(join(root, 'x', 'deep'), { recursive: true });
        writeFileSync(join(root, 'x', 'deep', 'far.rq'), 'export {};\n');
        services.shared.workspace.WorkspaceManager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'root', uri: URI.parse(pathToFileURL(root).href).toString() }]
        });
        document = await addWorkspaceDocument(root, 'app.rq', 'demo {\n    ["@/x"]\n}');

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 9 }
        });
        const names = (result?.items ?? []).map(item => String(item.label));
        const far = names.indexOf('@/x/deep/far.rq');
        const near = names.indexOf('./@/x/near.rq');
        expect(far).toBeGreaterThan(-1);
        expect(near).toBeGreaterThan(-1);
        expect(far).toBeLessThan(near);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_match_quality]
    test('ranks segment matches above subsequence matches', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const root = createTempWorkspace();
        mkdirSync(join(root, 'far', 'zz', 'ab', 'x'), { recursive: true });
        writeFileSync(join(root, 'far', 'zz', 'ab', 'x', 'cw.rq'), 'export {};\n');
        mkdirSync(join(root, 'yaqb'), { recursive: true });
        writeFileSync(join(root, 'yaqb', 'cx.rq'), 'export {};\n');
        services.shared.workspace.WorkspaceManager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'root', uri: URI.parse(pathToFileURL(root).href).toString() }]
        });
        document = await addWorkspaceDocument(root, 'importer.rq', 'demo {\n    ["ab/c"]\n}');

        const provider = services.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
        const result = await provider.getCompletion(document, {
            textDocument: { uri: document.textDocument.uri },
            position: { line: 1, character: 10 }
        });
        const names = (result?.items ?? []).map(item => String(item.label));
        const segment = names.indexOf('./far/zz/ab/x/cw.rq');
        const loose = names.indexOf('./yaqb/cx.rq');
        expect(segment).toBeGreaterThan(-1);
        expect(loose).toBeGreaterThan(-1);
        expect(segment).toBeLessThan(loose);
    });
});

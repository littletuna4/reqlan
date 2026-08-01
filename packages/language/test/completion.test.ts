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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_explicit_extension]
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
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_explicit_extension]
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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_path_segments]
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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_path_segments]
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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_substring_match]
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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_ranking]
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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".anonymous_reference_code_completion]
    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion]
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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".anonymous_reference_code_completion]
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

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".anonymous_reference_code_completion]
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
        expect(anonLabels.some(label => label.endsWith('.md'))).toBe(false);

        // Incomplete in-memory docs may appear in one set but not the other (self-skip).
        const importAliasLabels = new Set(
            importLabels.filter(label => label.startsWith('@/') && !label.includes('-open.rq'))
        );
        for (const label of anonLabels.filter(label => !label.includes('-open.rq'))) {
            expect(importAliasLabels.has(label)).toBe(true);
        }
    });
});

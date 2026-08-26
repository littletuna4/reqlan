/**
 * Performance guards for reference / anonymous file-path completion.
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { URI, type FileSystemProvider, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { clearDocuments } from 'langium/test';
import {
    clearPathCompletionCaches,
    createReqlanServices,
    pathCompletionCacheStats,
    ReqlanCompletionProvider,
    type Model
} from '@reqlan/language';

const BULK_DIRECTORY_COUNT = 40;
const FILES_PER_DIRECTORY = 25;

let tempDirs: string[] = [];
let services: ReturnType<typeof createReqlanServices> | undefined;
let directoryReads = 0;

afterEach(async () => {
    if (services) {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray();
        if (documents.length > 0) {
            clearDocuments(services.shared, documents);
        }
        services = undefined;
    }
    clearPathCompletionCaches();
    directoryReads = 0;
    for (const dir of tempDirs) {
        rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
});

function countingFileSystem(): FileSystemProvider {
    const inner = NodeFileSystem.fileSystemProvider();
    return new Proxy(inner, {
        get(target, property, receiver) {
            if (property === 'readDirectorySync') {
                return (uri: URI) => {
                    directoryReads += 1;
                    return target.readDirectorySync(uri);
                };
            }
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? (value as (...args: never[]) => unknown).bind(target) : value;
        }
    });
}

function createServices(): ReturnType<typeof createReqlanServices> {
    const fileSystem = countingFileSystem();
    const created = createReqlanServices({ fileSystemProvider: () => fileSystem });
    services = created;
    return created;
}

function createTempWorkspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'reqlan-completion-perf-'));
    tempDirs.push(dir);
    return dir;
}

function seedAcceptanceFiles(root: string): void {
    writeFileSync(join(root, 'lib.rq'), 'exported {}\n');
    writeFileSync(join(root, 'util.ts'), 'export const x = 1;\n');
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets', 'notes.md'), '# notes\n');
}

function seedBulkTree(root: string): number {
    let files = 0;
    for (let dirIndex = 0; dirIndex < BULK_DIRECTORY_COUNT; dirIndex += 1) {
        const dir = join(root, 'bulk', `d${String(dirIndex).padStart(2, '0')}`);
        mkdirSync(dir, { recursive: true });
        for (let fileIndex = 0; fileIndex < FILES_PER_DIRECTORY; fileIndex += 1) {
            writeFileSync(join(dir, `f${String(fileIndex).padStart(2, '0')}.ts`), `export const n = ${fileIndex};\n`);
            files += 1;
        }
    }
    return files;
}

async function parseHostDocument(
    created: ReturnType<typeof createReqlanServices>,
    root: string
): Promise<LangiumDocument<Model>> {
    const content = 'host {\n    see ["./"]\n}';
    const hostPath = join(root, 'host.rq');
    writeFileSync(hostPath, content);
    const libUri = URI.parse(pathToFileURL(join(root, 'lib.rq')).href);
    created.shared.workspace.LangiumDocuments.addDocument(
        created.shared.workspace.LangiumDocumentFactory.fromString('exported {}\n', libUri) as LangiumDocument<Model>
    );
    const hostUri = URI.parse(pathToFileURL(hostPath).href);
    const document = created.shared.workspace.LangiumDocumentFactory.fromString(
        content,
        hostUri
    ) as LangiumDocument<Model>;
    created.shared.workspace.LangiumDocuments.addDocument(document);
    await created.shared.workspace.DocumentBuilder.build(
        created.shared.workspace.LangiumDocuments.all.toArray(),
        { validation: false }
    );
    return document;
}

async function completeAnonymousPaths(
    created: ReturnType<typeof createReqlanServices>,
    document: LangiumDocument<Model>
) {
    const provider = created.Reqlan.lsp.CompletionProvider as ReqlanCompletionProvider;
    return provider.getCompletion(document, {
        textDocument: { uri: document.textDocument.uri },
        position: { line: 1, character: 12 }
    });
}

describe('Reference completion performance', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
    test('cached path completion does not re-read directories', async () => {
        const created = createServices();
        const root = createTempWorkspace();
        seedAcceptanceFiles(root);
        seedBulkTree(root);
        const document = await parseHostDocument(created, root);

        clearPathCompletionCaches();
        directoryReads = 0;
        const first = await completeAnonymousPaths(created, document);
        const firstReads = directoryReads;
        const firstStats = pathCompletionCacheStats();
        const firstLabels = (first?.items ?? []).map(item => String(item.label));

        expect(firstReads).toBeGreaterThan(0);
        expect(firstStats.directoryReads).toBe(firstReads);
        expect(firstLabels).toContain('./lib.rq');
        expect(firstLabels).toContain('./util.ts');
        expect(firstLabels).toContain('./assets/');
        expect(firstLabels).toContain('./assets/notes.md');

        const second = await completeAnonymousPaths(created, document);
        const secondStats = pathCompletionCacheStats();
        const secondLabels = (second?.items ?? []).map(item => String(item.label));

        expect(directoryReads).toBe(firstReads);
        expect(secondStats.directoryReads).toBe(firstReads);
        expect(secondStats.listingCacheHits).toBeGreaterThan(0);
        expect(secondLabels).toEqual(firstLabels);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
    test('large-tree anonymous completion stays under budget', async () => {
        const created = createServices();
        const root = createTempWorkspace();
        seedAcceptanceFiles(root);
        const bulkFiles = seedBulkTree(root);
        expect(bulkFiles).toBe(BULK_DIRECTORY_COUNT * FILES_PER_DIRECTORY);
        const document = await parseHostDocument(created, root);

        clearPathCompletionCaches();
        directoryReads = 0;

        const firstStarted = performance.now();
        const first = await completeAnonymousPaths(created, document);
        const firstMs = performance.now() - firstStarted;
        const firstLabels = (first?.items ?? []).map(item => String(item.label));
        expect(firstLabels).toContain('./lib.rq');
        expect(firstLabels).toContain('./util.ts');
        expect(firstLabels).toContain('./assets/');
        expect(firstLabels).toContain('./assets/notes.md');

        const cachedStarted = performance.now();
        await completeAnonymousPaths(created, document);
        const cachedMs = performance.now() - cachedStarted;

        expect(firstMs).toBeLessThan(2_000);
        expect(cachedMs).toBeLessThan(150);
        expect(directoryReads).toBeGreaterThan(0);
    }, 30_000);
});

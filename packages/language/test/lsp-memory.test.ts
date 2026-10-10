/**
 * Language-server memory bounds: native caches, scope eviction, workspace parse limit.
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".native_cache_retention]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".scope_cache_release]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".workspace_parse_concurrency]
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { AstUtils, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { FileChangeType } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createReqlanServices } from '../src/reqlan-module.js';
import { ReqlanDocumentUpdateHandler } from '../src/reqlan-document-update-handler.js';
import { noteOpenEditor } from '../src/reqlan-editor-retention.js';
import {
    analyzeDocumentLocalSymbolic,
    clearLocalSymbolicExtractCache,
    localSymbolicCacheSize
} from '../src/reqlan-local-symbolic-links.js';
import {
    clearNeighborParseCache,
    neighborCacheSize,
    parseNeighborDocument
} from '../src/reqlan-neighbor-parse.js';
import { pathResolveContextFromServices } from '../src/reqlan-path-resolve.js';
import { ReqlanScopeProvider } from '../src/reqlan-scope.js';
import { isLocalReference, isQualifiedReference } from '../src/generated/ast.js';
import {
    WORKSPACE_PARSE_CONCURRENCY,
    forEachWithConcurrency,
    resetWorkspaceParseStats,
    workspaceParsePeakInFlight
} from '../src/reqlan-workspace-manager.js';

const tempDirs: string[] = [];

afterEach(() => {
    clearNeighborParseCache();
    clearLocalSymbolicExtractCache();
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'reqlan-lsp-memory-'));
    tempDirs.push(dir);
    return dir;
}

function updateHandler(services: ReturnType<typeof createReqlanServices>): ReqlanDocumentUpdateHandler {
    const handler = services.shared.lsp.DocumentUpdateHandler;
    if (!(handler instanceof ReqlanDocumentUpdateHandler)) {
        throw new Error('expected ReqlanDocumentUpdateHandler');
    }
    return handler;
}

function scopeProvider(services: ReturnType<typeof createReqlanServices>): ReqlanScopeProvider {
    const provider = services.Reqlan.references.ScopeProvider;
    if (!(provider instanceof ReqlanScopeProvider)) {
        throw new Error('expected ReqlanScopeProvider');
    }
    return provider;
}

function openEvent(uri: string): { document: TextDocument } {
    return { document: TextDocument.create(uri, 'reqlan', 1, 'alpha {}\n') };
}

describe('native cache retention', () => {
    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".native_cache_retention]
    test('keeps the host extract while the editor is open', () => {
        const services = createReqlanServices(NodeFileSystem);
        const handler = updateHandler(services);
        const uri = URI.parse('file:///ws/memory/open.rq');
        const document = services.shared.workspace.LangiumDocumentFactory.fromString('alpha {}\n', uri);
        handler.didOpenDocument(openEvent(uri.toString()));
        analyzeDocumentLocalSymbolic(document, pathResolveContextFromServices(services));
        expect(localSymbolicCacheSize()).toBe(1);
        analyzeDocumentLocalSymbolic(document, pathResolveContextFromServices(services));
        expect(localSymbolicCacheSize()).toBe(1);

        handler.didCloseDocument(openEvent(uri.toString()));
        expect(localSymbolicCacheSize()).toBe(0);
        analyzeDocumentLocalSymbolic(document, pathResolveContextFromServices(services));
        expect(localSymbolicCacheSize()).toBe(0);
    });

    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".native_cache_retention]
    test('drops native caches when the Langium document is removed', async () => {
        const services = createReqlanServices(NodeFileSystem);
        const uri = URI.parse('file:///ws/memory/removed.rq');
        const document = services.shared.workspace.LangiumDocumentFactory.fromString('alpha {}\n', uri);
        services.shared.workspace.LangiumDocuments.addDocument(document);
        noteOpenEditor(uri.toString());
        analyzeDocumentLocalSymbolic(document, pathResolveContextFromServices(services));
        expect(localSymbolicCacheSize()).toBe(1);
        await services.shared.workspace.DocumentBuilder.update([], [uri]);
        expect(localSymbolicCacheSize()).toBe(0);
    });

    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".native_cache_retention]
    test('drops a neighbor list when the last open editor closes', () => {
        const dir = tempDir();
        const libPath = join(dir, 'lib.rq');
        writeFileSync(libPath, 'present_idea { body }\n');
        const services = createReqlanServices(NodeFileSystem);
        const handler = updateHandler(services);
        const libUri = URI.file(libPath);
        const hostA = 'file:///ws/memory/a.rq';
        const hostB = 'file:///ws/memory/b.rq';
        handler.didOpenDocument(openEvent(hostA));
        handler.didOpenDocument(openEvent(hostB));
        parseNeighborDocument(libUri, undefined, services.shared.workspace.FileSystemProvider, hostA);
        parseNeighborDocument(libUri, undefined, services.shared.workspace.FileSystemProvider, hostB);
        expect(neighborCacheSize()).toBe(1);

        handler.didCloseDocument(openEvent(hostA));
        expect(neighborCacheSize()).toBe(1);
        handler.didCloseDocument(openEvent(hostB));
        expect(neighborCacheSize()).toBe(0);
    });

    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".native_cache_retention]
    test('drops a neighbor list when the file watcher reports a delete', () => {
        const dir = tempDir();
        const libPath = join(dir, 'lib.rq');
        writeFileSync(libPath, 'present_idea { body }\n');
        const services = createReqlanServices(NodeFileSystem);
        const handler = updateHandler(services);
        const libUri = URI.file(libPath);
        const hostUri = 'file:///ws/memory/host.rq';
        handler.didOpenDocument(openEvent(hostUri));
        parseNeighborDocument(libUri, undefined, services.shared.workspace.FileSystemProvider, hostUri);
        expect(neighborCacheSize()).toBe(1);

        handler.didChangeWatchedFiles({
            changes: [{ uri: libUri.toString(), type: FileChangeType.Deleted }]
        });
        expect(neighborCacheSize()).toBe(0);
    });

    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".native_cache_retention]
    test('does not store a neighbor list for a closed editor', () => {
        const dir = tempDir();
        const libPath = join(dir, 'lib.rq');
        writeFileSync(libPath, 'present_idea { body }\n');
        const services = createReqlanServices(NodeFileSystem);
        const libUri = URI.file(libPath);
        const parsed = parseNeighborDocument(
            libUri,
            undefined,
            services.shared.workspace.FileSystemProvider,
            'file:///ws/memory/closed.rq'
        );
        expect(parsed?.ideas.map(idea => idea.name)).toEqual(['present_idea']);
        expect(neighborCacheSize()).toBe(0);
    });
});

describe('scope cache release', () => {
    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".scope_cache_release]
    test('drops scope cache entries when a document is removed', async () => {
        const dir = tempDir();
        const libPath = join(dir, 'lib.rq');
        const hostPath = join(dir, 'host.rq');
        writeFileSync(libPath, 'gamma {}\n');
        writeFileSync(hostPath, 'alpha {}\nbeta { see [alpha] and ["./lib.rq".gamma] }\n');
        const services = createReqlanServices(NodeFileSystem);
        const provider = scopeProvider(services);
        const documents = services.shared.workspace.LangiumDocuments;
        const libUri = URI.parse(pathToFileURL(libPath).href);
        const hostUri = URI.parse(pathToFileURL(hostPath).href);
        const lib = await documents.getOrCreateDocument(libUri);
        const host = await documents.getOrCreateDocument(hostUri);
        fillScopeCaches(provider, host);
        const before = provider.scopeCacheCounts();
        expect(before.fileIdeas).toBe(1);
        expect(before.importPaths).toBe(1);

        await services.shared.workspace.DocumentBuilder.update([], [lib.uri]);
        const afterLib = provider.scopeCacheCounts();
        expect(afterLib.importPaths).toBe(0);
        expect(afterLib.fileIdeas).toBe(1);

        await services.shared.workspace.DocumentBuilder.update([], [host.uri]);
        const afterHost = provider.scopeCacheCounts();
        expect(afterHost.fileIdeas).toBe(0);
        expect(afterHost.importPaths).toBe(0);
    });
});

describe('workspace parse concurrency', () => {
    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".workspace_parse_concurrency]
    test('runs at most the concurrency limit', async () => {
        let inFlight = 0;
        let peak = 0;
        const items = Array.from({ length: 12 }, (_value, index) => index);
        await forEachWithConcurrency(items, 4, async () => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise(resolve => {
                setTimeout(resolve, 15);
            });
            inFlight -= 1;
        });
        expect(peak).toBe(4);
    });

    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".workspace_parse_concurrency]
    test('loads every workspace file with at most 8 parses in flight', async () => {
        const dir = tempDir();
        const fileCount = WORKSPACE_PARSE_CONCURRENCY + 2;
        for (let index = 0; index < fileCount; index += 1) {
            writeFileSync(join(dir, `idea_${index}.rq`), `idea_${index} {}\n`);
        }
        const services = createReqlanServices(NodeFileSystem);
        resetWorkspaceParseStats();
        const manager = services.shared.workspace.WorkspaceManager;
        manager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'ws', uri: pathToFileURL(dir).href }]
        });
        await manager.initialized({});
        expect(services.shared.workspace.LangiumDocuments.all.toArray()).toHaveLength(fileCount);
        const peak = workspaceParsePeakInFlight();
        expect(peak).toBeGreaterThan(1);
        expect(peak).toBeLessThanOrEqual(WORKSPACE_PARSE_CONCURRENCY);
    });
});

function fillScopeCaches(provider: ReqlanScopeProvider, host: LangiumDocument): void {
    const local = AstUtils.streamAst(host.parseResult.value).find(isLocalReference);
    const qualified = AstUtils.streamAst(host.parseResult.value).find(isQualifiedReference);
    if (!local || !qualified) {
        throw new Error('expected a local reference and a qualified reference');
    }
    provider.getScope({
        reference: local.idea,
        container: local,
        property: 'idea'
    });
    provider.getScope({
        reference: qualified.idea,
        container: qualified,
        property: 'idea'
    });
}

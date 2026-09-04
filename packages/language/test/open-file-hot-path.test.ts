/**
 * Cheap open-file hot path: host extract cache, URI-only neighbor lookup, targeted relink.
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".outbound_one_hop]
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import { DiagnosticSeverity, CancellationToken } from 'vscode-languageserver';
import { createReqlanServices } from '../src/reqlan-module.js';
import { type Model } from '../src/generated/ast.js';
import {
    applyOutboundDiagnosticAuthority,
    diagnosticMessageText,
    isUnresolvedIdeaMessage
} from '../src/reqlan-outbound-presentation.js';
import {
    analyzeDocumentLocalSymbolic,
    clearLocalSymbolicExtractCache,
    collectLocalSymbolicOutboundLinks,
    localSymbolicExtractCount
} from '../src/reqlan-local-symbolic-links.js';
import { findLoadedDocument } from '../src/reqlan-neighbor-parse.js';
import { pathResolveContextFromServices } from '../src/reqlan-path-resolve.js';

const RELINK_MARKER = 'RELINK_MARKER';

function diagnosticText(diagnostic: { message: Parameters<typeof diagnosticMessageText>[0] }): string | undefined {
    return diagnosticMessageText(diagnostic.message);
}

function isUnresolvedNamed(
    diagnostic: { message: Parameters<typeof diagnosticMessageText>[0] },
    name: string
): boolean {
    const text = diagnosticText(diagnostic);
    return text !== undefined && isUnresolvedIdeaMessage(text) && text.includes(name);
}

describe('open-file hot path', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;
    const tempDirs: string[] = [];

    beforeAll(() => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
    });

    afterEach(async () => {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray();
        if (documents.length > 0) {
            await clearDocuments(services.shared, documents);
        }
        clearLocalSymbolicExtractCache();
        for (const dir of tempDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    function writeDir(files: Record<string, string>): string {
        const dir = mkdtempSync(join(tmpdir(), 'reqlan-hot-path-'));
        tempDirs.push(dir);
        for (const [name, text] of Object.entries(files)) {
            const path = join(dir, name);
            mkdirSync(join(path, '..'), { recursive: true });
            writeFileSync(path, text);
        }
        return dir;
    }

    function addRelinkMarker(document: LangiumDocument): void {
        const existing = document.diagnostics ?? [];
        document.diagnostics = [
            ...existing,
            {
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 1 }
                },
                message: RELINK_MARKER,
                source: 'reqlan-test'
            }
        ];
    }

    function hasRelinkMarker(document: LangiumDocument): boolean {
        return (document.diagnostics ?? []).some(diagnostic => diagnosticText(diagnostic) === RELINK_MARKER);
    }

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
    test('reuses the host native extract for links and diagnostics', async () => {
        const dir = writeDir({
            'lib.rq': 'present_idea { body }\n'
        });
        const document = await parse(s`
            host {
                see ["./lib.rq".present_idea]
            }
        `, {
            documentUri: pathToFileURL(join(dir, 'host.rq')).href
        });
        const pathContext = pathResolveContextFromServices(services);
        clearLocalSymbolicExtractCache();
        collectLocalSymbolicOutboundLinks(
            document,
            pathContext,
            services.shared.workspace.LangiumDocuments
        );
        collectLocalSymbolicOutboundLinks(
            document,
            pathContext,
            services.shared.workspace.LangiumDocuments
        );
        applyOutboundDiagnosticAuthority(document, services.Reqlan);
        expect(localSymbolicExtractCount()).toBe(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
    test('reparses the host native extract when this buffer text changes', async () => {
        const dir = writeDir({
            'life.rq': 'first_idea { body }\n'
        });
        const path = join(dir, 'life.rq');
        const uri = URI.parse(pathToFileURL(path).href);
        const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
        clearLocalSymbolicExtractCache();
        analyzeDocumentLocalSymbolic(document, pathResolveContextFromServices(services));
        expect(localSymbolicExtractCount()).toBe(1);
        writeFileSync(path, 'second_idea { body }\n');
        await services.shared.workspace.LangiumDocumentFactory.update(document, CancellationToken.None);
        analyzeDocumentLocalSymbolic(document, pathResolveContextFromServices(services));
        expect(localSymbolicExtractCount()).toBe(2);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
    test('does not treat a same-name file as the loaded neighbor', () => {
        const lookup = createReqlanServices(EmptyFileSystem);
        const factory = lookup.shared.workspace.LangiumDocumentFactory;
        const documents = lookup.shared.workspace.LangiumDocuments;
        const alpha = factory.fromString('alpha_lib {}\n', URI.parse('file:///ws/a/lib.rq'));
        const beta = factory.fromString('beta_lib {}\n', URI.parse('file:///ws/b/lib.rq'));
        documents.addDocument(alpha);
        documents.addDocument(beta);
        expect(findLoadedDocument(documents, alpha.uri.toString())).toBe(alpha);
        expect(findLoadedDocument(documents, beta.uri.toString())).toBe(beta);
        expect(findLoadedDocument(documents, 'file:///ws/c/lib.rq')).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
    test('does not relink an unrelated file that still has linker errors', async () => {
        const dir = writeDir({
            'lonely.rq': 'broken { see [nope] }\n',
            'other.rq': 'ok {}\n'
        });
        const lonelyUri = URI.parse(pathToFileURL(join(dir, 'lonely.rq')).href);
        const otherUri = URI.parse(pathToFileURL(join(dir, 'other.rq')).href);
        const lonely = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(lonelyUri);
        const other = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(otherUri);
        await services.shared.workspace.DocumentBuilder.build([lonely, other], { validation: true });
        const unresolved = (lonely.diagnostics ?? []).filter(
            diagnostic => isUnresolvedIdeaMessage(diagnostic.message)
        );
        expect(unresolved.length).toBeGreaterThanOrEqual(1);
        addRelinkMarker(lonely);
        writeFileSync(join(dir, 'other.rq'), 'ok { updated }\n');
        await services.shared.workspace.DocumentBuilder.update([otherUri], []);
        expect(hasRelinkMarker(lonely)).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
    test('relinks a host when its neighbor file changes', async () => {
        const dir = writeDir({
            'lib.rq': 'other {}\n',
            'host.rq': s`
                host {
                    see ["./lib.rq".present_idea]
                }
            `
        });
        const hostUri = URI.parse(pathToFileURL(join(dir, 'host.rq')).href);
        const libUri = URI.parse(pathToFileURL(join(dir, 'lib.rq')).href);
        const host = await parse(s`
            host {
                see ["./lib.rq".present_idea]
            }
        `, {
            documentUri: hostUri.toString()
        });
        await services.shared.workspace.DocumentBuilder.build([host], { validation: true });
        expect(
            (host.diagnostics ?? []).some(diagnostic => isUnresolvedNamed(diagnostic, 'present_idea'))
        ).toBe(true);
        addRelinkMarker(host);
        writeFileSync(join(dir, 'lib.rq'), 'present_idea { body }\n');
        await services.shared.workspace.DocumentBuilder.update([libUri], []);
        expect(hasRelinkMarker(host)).toBe(false);
        expect(
            (host.diagnostics ?? []).some(diagnostic => isUnresolvedNamed(diagnostic, 'present_idea'))
        ).toBe(false);
    });
});

/**
 * Parsed-time LSP handlers must not touch Langium `.ref` (triggers uncached linking
 * retries and "Attempted reference resolution before document reached ComputedScopes").
 * git: Diff buffers often stay at Parsed while hover/definition/highlight/links fire repeatedly.
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_algorithm]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".ast_lifecycle]
 */
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { DocumentState, URI, type LangiumDocument } from 'langium';
import { EmptyFileSystem } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments } from 'langium/test';
import { createReqlanServices } from '../src/reqlan-module.js';
import { clearLocalSymbolicExtractCache } from '../src/reqlan-local-symbolic-links.js';
import { clearNeighborParseCache } from '../src/reqlan-neighbor-parse.js';
import type { Model } from '../src/generated/ast.js';

describe('Parsed-time reference sequencing', () => {
    let services: ReturnType<typeof createReqlanServices>;

    beforeAll(() => {
        services = createReqlanServices(EmptyFileSystem);
    });

    afterEach(async () => {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray();
        if (documents.length > 0) {
            await clearDocuments(services.shared, documents);
        }
        clearNeighborParseCache();
        clearLocalSymbolicExtractCache();
    });

    function populateParsed(text: string, fileName: string): LangiumDocument<Model> {
        const uri = URI.parse(`git:/virtual/${fileName}?${encodeURIComponent(JSON.stringify({
            path: `/virtual/${fileName}`,
            ref: '~'
        }))}`);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(text, uri);
        services.shared.workspace.LangiumDocuments.addDocument(document);
        expect(document.state).toBe(DocumentState.Parsed);
        return document as LangiumDocument<Model>;
    }

    function ideaOffset(document: LangiumDocument, name: string): number {
        const text = document.textDocument.getText();
        const index = text.indexOf(name);
        expect(index).toBeGreaterThanOrEqual(0);
        return index;
    }

    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_hot_path]
    test('definition hover highlight and links do not resolve refs before ComputedScopes', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const document = populateParsed(s`
            alpha {
                see [beta] and ["./missing.rq".other]
            }
            beta {
                body
            }
        `, 'w1-core-preparation.rq');

        const betaPos = document.textDocument.positionAt(ideaOffset(document, '[beta]') + 1);
        const params = {
            textDocument: { uri: document.uri.toString() },
            position: betaPos
        };

        // Simulate the open-file LSP fan-out that Diff editors trigger at Parsed.
        for (let i = 0; i < 20; i++) {
            await services.Reqlan.lsp.DefinitionProvider?.getDefinition(document, params);
            await services.Reqlan.lsp.HoverProvider?.getHoverContent(document, params);
            await services.Reqlan.lsp.DocumentHighlightProvider?.getDocumentHighlight(document, params);
            await services.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
                textDocument: { uri: document.uri.toString() }
            });
        }

        expect(document.state).toBe(DocumentState.Parsed);
        const premature = warn.mock.calls.filter(args =>
            String(args[0] ?? '').includes('Attempted reference resolution before document reached ComputedScopes')
        );
        expect(premature).toEqual([]);
        warn.mockRestore();
    });

    // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_hot_path]
    test('definition still resolves same-file ideas at Parsed via symbolic path', async () => {
        const document = populateParsed(s`
            alpha {
                see [beta]
            }
            beta {
                body
            }
        `, 'symbolic-at-parsed.rq');
        const betaPos = document.textDocument.positionAt(ideaOffset(document, '[beta]') + 1);
        const links = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(document, {
            textDocument: { uri: document.uri.toString() },
            position: betaPos
        });
        expect(links?.length).toBeGreaterThan(0);
        expect(document.state).toBe(DocumentState.Parsed);
    });
});

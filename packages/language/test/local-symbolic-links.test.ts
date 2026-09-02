/**
 * Document links from local symbolic extract without loading imported documents.
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".non_web_reference_navigation]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".unresolved_reference_diagnostics]
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from '../src/reqlan-module.js';

describe('local symbolic document links', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;
    let fileServices: ReturnType<typeof createReqlanServices>;
    let fileParse: ReturnType<typeof parseHelper<Model>>;

    beforeAll(() => {
        services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        fileServices = createReqlanServices(NodeFileSystem);
        fileParse = parseHelper<Model>(fileServices.Reqlan);
    });

    // rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".non_web_reference_navigation]
    test('same-file idea links without DocumentBuilder / workspace link', async () => {
        const document: LangiumDocument<Model> = await parse(s`
            alpha {
                body
            }
            beta {
                see [alpha] and [[alpha]]
            }
        `);
        // Intentionally do not call DocumentBuilder.build — no Linked state.
        const links = await services.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        }) ?? [];
        const alphaLinks = links.filter(
            entry => document.textDocument.getText(entry.range) === 'alpha'
        );
        expect(alphaLinks.length).toBeGreaterThanOrEqual(2);
        for (const link of alphaLinks) {
            expect(link.target).toContain(document.textDocument.uri);
            expect(link.target).toMatch(/#L\d+/);
        }
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".unresolved_reference_diagnostics]
    test('unresolved same-file ideas get no document link', async () => {
        const document: LangiumDocument<Model> = await parse(s`
            beta {
                see [missing_idea]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const links = await services.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        }) ?? [];
        const missingLinks = links.filter(
            entry => document.textDocument.getText(entry.range) === 'missing_idea'
        );
        expect(missingLinks).toHaveLength(0);
        const unresolved = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("Could not resolve reference to IdeaDeclaration named 'missing_idea'")
        );
        expect(unresolved).toHaveLength(1);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".unresolved_reference_diagnostics]
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".non_web_reference_navigation]
    test('missing cross-file targets do not get document links', async () => {
        const document: LangiumDocument<Model> = await fileParse(s`
            demo {
                see ["./does-not-exist-anywhere.rq".gone]
            }
        `, { documentUri: URI.file('/workspace/example_rq_project/host-missing-link.rq').toString() });
        const links = await fileServices.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        }) ?? [];
        const goneLinks = links.filter(
            entry => document.textDocument.getText(entry.range) === 'gone'
        );
        expect(goneLinks).toHaveLength(0);
    });
});

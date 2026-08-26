/**
 * Document links from local symbolic extract without loading imported documents.
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from '@reqlan/language';
import { ReqlanDocumentLinkProvider } from '../src/reqlan-document-link-provider.js';

describe('local symbolic document links', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;

    beforeAll(() => {
        services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
    });

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
        const provider = new ReqlanDocumentLinkProvider(services.Reqlan);
        const links = provider.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        });
        const alphaLinks = links.filter(
            entry => document.textDocument.getText(entry.range) === 'alpha'
        );
        expect(alphaLinks.length).toBeGreaterThanOrEqual(2);
        for (const link of alphaLinks) {
            expect(link.target).toContain(document.textDocument.uri);
            expect(link.target).toMatch(/#L\d+/);
        }
    });
});

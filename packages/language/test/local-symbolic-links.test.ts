/**
 * Document links from local symbolic extract without loading imported documents.
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".outbound_one_hop]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".non_web_reference_navigation]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".unresolved_reference_diagnostics]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_underline_syntax_align]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".aliased_from_import_ctrl_click]
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import { createReqlanServices } from '../src/reqlan-module.js';
import { isLocalReference, type Model } from '../src/generated/ast.js';
import { createSourceTextDocument } from '../src/reqlan-comment-resolver.js';
import { neighborTargetCandidateUris } from '../src/reqlan-imports.js';
import { applyOutboundDiagnosticAuthority } from '../src/reqlan-outbound-presentation.js';
import {
    clearLocalSymbolicExtractCache,
    writtenIdeaTokenInReferenceSpan
} from '../src/reqlan-local-symbolic-links.js';

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

    afterEach(() => {
        clearLocalSymbolicExtractCache();
    });

    // rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".non_web_reference_navigation]
    test('same-file idea links without DocumentBuilder / workspace link', async () => {
        const document: LangiumDocument<Model> = await parse(s`
            alpha {
                body
            }
            beta {
                see [alpha] and [[alpha]]
            }
        `);
        // parseHelper builds the document; idea links still come from local extract.
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

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".unresolved_reference_diagnostics]
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

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".unresolved_reference_diagnostics]
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".non_web_reference_navigation]
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

    // Native extract spans are UTF-8 bytes; LSP ranges are UTF-16. Non-ASCII before a
    // reference used to shift the document-link / error underline off the syntax token.
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_underline_syntax_align]
    test('idea underlines match syntax tokens after non-ASCII text', async () => {
        const document: LangiumDocument<Model> = await parse(s`
            alpha {
                body
            }
            beta {
                café — 你好 😀 then [alpha]
            }
            gamma {
                café — 你好 😀 then [missing_after_unicode]
            }
        `);
        const links = await services.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        }) ?? [];
        const alphaRef = AstUtils.streamAst(document.parseResult.value)
            .filter(isLocalReference)
            .find(node => node.idea.$refText === 'alpha');
        const syntaxRange = alphaRef?.idea.$refNode?.range;
        expect(syntaxRange).toBeDefined();
        expect(document.textDocument.getText(syntaxRange!)).toBe('alpha');
        const matchingLink = links.find(link =>
            link.range.start.line === syntaxRange!.start.line
            && link.range.start.character === syntaxRange!.start.character
            && link.range.end.line === syntaxRange!.end.line
            && link.range.end.character === syntaxRange!.end.character
        );
        expect(matchingLink).toBeDefined();
        expect(document.textDocument.getText(matchingLink!.range)).toBe('alpha');

        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        applyOutboundDiagnosticAuthority(document, services.Reqlan);
        const missingRef = AstUtils.streamAst(document.parseResult.value)
            .filter(isLocalReference)
            .find(node => node.idea.$refText === 'missing_after_unicode');
        const missingSyntax = missingRef?.idea.$refNode?.range;
        expect(missingSyntax).toBeDefined();
        expect(document.textDocument.getText(missingSyntax!)).toBe('missing_after_unicode');
        const missingDiagnostics = (document.diagnostics ?? []).filter(diagnostic =>
            typeof diagnostic.message === 'string'
            && diagnostic.message.includes("named 'missing_after_unicode'")
        );
        expect(missingDiagnostics.length).toBeGreaterThan(0);
        for (const diagnostic of missingDiagnostics) {
            expect(diagnostic.range).toEqual(missingSyntax);
        }
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".aliased_from_import_ctrl_click]
    test('written idea token is the alias, not an imported-name suffix', () => {
        expect(writtenIdeaTokenInReferenceSpan('[ontology-simulation]')).toBe('ontology-simulation');
        expect(writtenIdeaTokenInReferenceSpan('[[ontology-simulation]]')).toBe('ontology-simulation');
        expect(writtenIdeaTokenInReferenceSpan('["@/_charter/plant-ontology.rq".simulation]')).toBe('simulation');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".aliased_from_import_ctrl_click]
    test('does not re-resolve an already-absolute neighbor path against the document directory', () => {
        const document = createSourceTextDocument(
            'file:///ws/_charter/modules/simulation/simulation.rq',
            'host {}'
        );
        const uris = neighborTargetCandidateUris(
            '/ws/_charter/plant-ontology.rq',
            document
        );
        expect(uris.map(uri => uri.toString())).toContain('file:///ws/_charter/plant-ontology.rq');
        expect(uris.some(uri => uri.path.includes('/modules/simulation/_charter/'))).toBe(false);
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".aliased_from_import_ctrl_click]
    // rq:["../../../reqlan rq/language/imports.rq".import_from]
    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    test('aliased from-import whose name contains the imported idea is one link', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'reqlan-alias-link-'));
        try {
            mkdirSync(join(dir, '_charter/modules/simulation'), { recursive: true });
            const ontologyPath = join(dir, '_charter/plant-ontology.rq');
            const hostPath = join(dir, '_charter/modules/simulation/simulation.rq');
            writeFileSync(ontologyPath, s`
                simulation {
                    An evaluation of the model.
                }
            `);
            writeFileSync(hostPath, s`
                from "@/_charter/plant-ontology.rq" import simulation as ontology-simulation
                simulation-observability {
                    [ontology-simulation] state should be observable as it runs.
                }
            `);
            const aliasServices = createReqlanServices(NodeFileSystem);
            aliasServices.shared.workspace.WorkspaceManager.initialize({
                processId: null,
                capabilities: {},
                rootUri: null,
                workspaceFolders: [{ name: 'ws', uri: pathToFileURL(dir).href }]
            });
            const host = await aliasServices.shared.workspace.LangiumDocuments.getOrCreateDocument(
                URI.parse(pathToFileURL(hostPath).href)
            );
            const ontology = await aliasServices.shared.workspace.LangiumDocuments.getOrCreateDocument(
                URI.parse(pathToFileURL(ontologyPath).href)
            );
            await aliasServices.shared.workspace.DocumentBuilder.build([host, ontology], { validation: false });

            const links = await aliasServices.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(host, {
                textDocument: { uri: host.textDocument.uri }
            }) ?? [];
            const ref = AstUtils.streamAst(host.parseResult.value)
                .filter(isLocalReference)
                .find(node => node.idea.$refText === 'ontology-simulation');
            expect(ref?.idea.$refNode).toBeDefined();
            const tokenRange = ref!.idea.$refNode!.range;
            expect(host.textDocument.getText(tokenRange)).toBe('ontology-simulation');

            const overlapping = links.filter(link =>
                link.range.start.line === tokenRange.start.line
                && link.range.start.character <= tokenRange.end.character
                && link.range.end.character >= tokenRange.start.character
            );
            expect(overlapping).toHaveLength(1);
            expect(host.textDocument.getText(overlapping[0]!.range)).toBe('ontology-simulation');
            expect(overlapping[0]?.range).toEqual(tokenRange);
            expect(overlapping[0]?.target).toContain('plant-ontology.rq');
            expect(overlapping[0]?.target).not.toContain('modules/simulation/_charter');

            const prefixPos = tokenRange.start;
            const suffixPos = {
                line: tokenRange.end.line,
                character: tokenRange.end.character - 1
            };
            for (const position of [prefixPos, suffixPos]) {
                const defs = await aliasServices.Reqlan.lsp.DefinitionProvider?.getDefinition(host, {
                    textDocument: { uri: host.textDocument.uri },
                    position
                });
                expect(defs).toHaveLength(1);
                expect(defs![0].targetUri).toBe(ontology.textDocument.uri);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
            clearLocalSymbolicExtractCache();
        }
    });
});


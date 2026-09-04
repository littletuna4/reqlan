/**
 * Depth-1 outbound hop: neighbor parse, links, errors, comment backlinks.
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_algorithm]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".outbound_one_hop]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".missing_reference_colour_sequence]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".token_colour_sequence]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".comment_backlink_sequence]
 * rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import { CancellationToken } from 'vscode-languageserver';
import { createReqlanServices, type Model } from '../src/reqlan-module.js';
import {
    presentCommentReferencesForDocument
} from '../src/reqlan-comment-diagnostics.js';
import {
    clearNeighborParseCache,
    neighborParseCount
} from '../src/reqlan-neighbor-parse.js';
import { isUnresolvedIdeaMessage } from '../src/reqlan-outbound-presentation.js';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('outbound one-hop sequencing', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;
    let tempDir: string | undefined;

    beforeAll(() => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
    });

    afterEach(async () => {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray();
        if (documents.length > 0) {
            await clearDocuments(services.shared, documents);
        }
        clearNeighborParseCache();
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    function writeWorkspace(files: Record<string, string>): string {
        tempDir = mkdtempSync(join(tmpdir(), 'reqlan-outbound-hop-'));
        for (const [name, text] of Object.entries(files)) {
            writeFileSync(join(tempDir, name), text);
        }
        return tempDir;
    }

    async function parseHost(dir: string, text: string): Promise<LangiumDocument<Model>> {
        return parse(text, {
            documentUri: pathToFileURL(join(dir, 'host.rq')).href
        });
    }

    async function documentLinks(document: LangiumDocument): Promise<string[]> {
        const links = await services.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        }) ?? [];
        return links.map(link => document.textDocument.getText(link.range));
    }

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".outbound_one_hop]
    test('links a neighbor idea after a depth-1 parse without loading the target document', async () => {
        const dir = writeWorkspace({
            'lib.rq': s`
                present_idea {
                    body
                }
            `,
            'host.rq': s`
                host {
                    see ["./lib.rq".present_idea]
                }
            `
        });
        const document = await parseHost(dir, s`
            host {
                see ["./lib.rq".present_idea]
            }
        `);
        expect(services.shared.workspace.LangiumDocuments.all.toArray()).toHaveLength(1);
        const labels = await documentLinks(document);
        expect(labels).toContain('present_idea');
        const links = await services.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        }) ?? [];
        const ideaLink = links.find(link => document.textDocument.getText(link.range) === 'present_idea');
        expect(ideaLink?.target).toContain('lib.rq');
        expect(ideaLink?.target).toMatch(/#L\d+/);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".missing_reference_colour_sequence]
    test('does not link when the neighbor file exists but the idea is missing', async () => {
        const dir = writeWorkspace({
            'lib.rq': s`
                other_idea {
                    body
                }
            `
        });
        const document = await parseHost(dir, s`
            host {
                see ["./lib.rq".absent_idea]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const labels = await documentLinks(document);
        expect(labels).not.toContain('absent_idea');
        const unresolved = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && isUnresolvedIdeaMessage(diagnostic.message)
                && diagnostic.message.includes('absent_idea')
        );
        expect(unresolved.length).toBeGreaterThanOrEqual(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".outbound_one_hop]
    test('does not parse a neighbor of the neighbor', async () => {
        const dir = writeWorkspace({
            'deeper.rq': s`
                gone {
                    body
                }
            `,
            'lib.rq': s`
                present_idea {
                    see ["./deeper.rq".gone]
                }
            `
        });
        clearNeighborParseCache();
        const document = await parseHost(dir, s`
            host {
                see ["./lib.rq".present_idea]
            }
        `);
        const labels = await documentLinks(document);
        expect(labels).toContain('present_idea');
        expect(labels).not.toContain('gone');
        expect(neighborParseCount()).toBe(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".outbound_one_hop]
    test('reuses a cached neighbor parse for the same content', async () => {
        const dir = writeWorkspace({
            'lib.rq': s`
                present_idea {
                    body
                }
            `
        });
        const document = await parseHost(dir, s`
            host {
                see ["./lib.rq".present_idea] and ["./lib.rq".present_idea]
            }
        `);
        clearNeighborParseCache();
        await documentLinks(document);
        const first = neighborParseCount();
        expect(first).toBe(1);
        await documentLinks(document);
        expect(neighborParseCount()).toBe(first);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".missing_reference_colour_sequence]
    test('keeps URL and wildcard document links', async () => {
        const dir = writeWorkspace({
            'lib.rq': 'present_idea { body }\n'
        });
        const document = await parseHost(dir, s`
            host {
                see [https://reqlan.com/] and ["./*.rq".present_*]
            }
        `);
        const links = await services.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        }) ?? [];
        const targets = links.map(link => link.target ?? '');
        expect(targets.some(target => target.includes('https://reqlan.com/'))).toBe(true);
        expect(targets.some(target => target.startsWith('command:'))).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".missing_reference_colour_sequence]
    test('drops a false unresolved diagnostic when the neighbor idea exists', async () => {
        const dir = writeWorkspace({
            'lib.rq': s`
                present_idea {
                    body
                }
            `
        });
        const document = await parseHost(dir, s`
            host {
                see ["./lib.rq".present_idea]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const unresolved = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && isUnresolvedIdeaMessage(diagnostic.message)
                && diagnostic.message.includes('present_idea')
        );
        expect(unresolved).toHaveLength(0);
        const labels = await documentLinks(document);
        expect(labels).toContain('present_idea');
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".missing_reference_colour_sequence]
    test('reports an unresolved import path', async () => {
        const dir = writeWorkspace({});
        const document = await parseHost(dir, s`
            from "./does-not-exist.rq" import missing_idea
            host {
                body
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const imports = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("Could not resolve import './does-not-exist.rq'")
        );
        expect(imports.length).toBeGreaterThanOrEqual(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".token_colour_sequence]
    test('semantic tokens are available from Parsed AST without workspace link', async () => {
        const dir = writeWorkspace({
            'lib.rq': 'present_idea { body }\n'
        });
        const document = await parseHost(dir, s`
            host {
                see ["./lib.rq".present_idea]
            }
        `);
        const provider = services.Reqlan.lsp.SemanticTokenProvider!;
        const result = await provider.semanticHighlight(
            document,
            { textDocument: { uri: document.textDocument.uri } },
            CancellationToken.None
        );
        expect(result.data.length).toBeGreaterThan(0);
        expect(services.shared.workspace.LangiumDocuments.all.toArray()).toHaveLength(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_algorithm]
    test('open-file-sequencing.rq parses mermaid sequence diagrams', async () => {
        const path = join(repoDir, 'reqlan rq/extension/language-support/open-file-sequencing.rq');
        const document = await parse(readFileSync(path, 'utf8'), {
            documentUri: pathToFileURL(path).href
        });
        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        const names = new Set(
            (document.parseResult.value.elements ?? [])
                .map(element => 'name' in element ? element.name : undefined)
                .filter((name): name is string => typeof name === 'string')
        );
        expect(names.has('open_file_algorithm')).toBe(true);
        expect(names.has('open_file_sequence_diagram')).toBe(true);
        expect(names.has('token_colour_sequence')).toBe(true);
        expect(names.has('file_crawl_sequence')).toBe(true);
        expect(names.has('missing_reference_colour_sequence')).toBe(true);
        expect(names.has('comment_backlink_sequence')).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".comment_backlink_sequence]
    test('comment references confirm the neighbor idea without loading Langium', async () => {
        const dir = writeWorkspace({
            'lib.rq': s`
                present_idea {
                    body
                }
            `
        });
        const document = await parseHost(dir, [
            'host {',
            '    body',
            '}',
            '// rq:["./lib.rq".present_idea]',
            ''
        ].join('\n'));
        expect(services.shared.workspace.LangiumDocuments.all.toArray()).toHaveLength(1);
        const presented = presentCommentReferencesForDocument(
            document,
            services.shared.workspace.LangiumDocuments,
            services.shared.workspace.FileSystemProvider
        );
        expect(presented.diagnostics).toHaveLength(0);
        expect(presented.links).toHaveLength(1);
        expect(presented.links[0]?.idea).toBe('present_idea');
        expect(presented.links[0]?.targetUri).toMatch(/lib\.rq#L\d+/);
    });
});

/**
 * rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
 * rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
 * rq:["../../../reqlan rq/language/imports.rq".idea_path_filter]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from '@reqlan/language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';
import { ideaId } from '../src/core/types.js';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('wildcard reference edge fan-out', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;

    beforeAll(() => {
        services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper(services.Reqlan);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('expands wildcard refs to one edge per matching idea', async () => {
        clearDocuments(services.shared, services.shared.workspace.LangiumDocuments.all.toArray());
        const alphaUri = 'file:///workspace/mods/alpha.rq';
        const betaUri = 'file:///workspace/mods/beta.rq';
        const host = await parse(
            [
                'host {',
                '    Related ["./mods/*.rq".widget_*].',
                '}',
                ''
            ].join('\n'),
            {
                documentUri: URI.file('/workspace/host-fanout.rq'),
                validation: false
            }
        );

        const indexed = extractIndexedDocument(host, {
            ideaCandidates: [
                {
                    fileUri: alphaUri,
                    filePath: '/workspace/mods/alpha.rq',
                    ideaName: 'widget_a'
                },
                {
                    fileUri: alphaUri,
                    filePath: '/workspace/mods/alpha.rq',
                    ideaName: 'other'
                },
                {
                    fileUri: betaUri,
                    filePath: '/workspace/mods/beta.rq',
                    ideaName: 'widget_b'
                }
            ]
        });
        expect(indexed).toBeDefined();
        const hostId = ideaId(host.uri.toString(), 'host');
        const refs = indexed!.edges.filter(
            edge => edge.sourceId === hostId && edge.kind === 'references' && edge.isResolved
        );
        // collectIdeaEdges + collectReferenceEdges both walk the AST — dedupe by targetId.
        const targetIds = [...new Set(refs.map(edge => edge.targetId))].sort();
        expect(targetIds).toEqual([
            ideaId(alphaUri, 'widget_a'),
            ideaId(betaUri, 'widget_b')
        ].sort());
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('emits unresolved edge when catalog has no matches', async () => {
        clearDocuments(services.shared, services.shared.workspace.LangiumDocuments.all.toArray());
        const host = await parse(
            [
                'host {',
                '    Related ["./mods/*.rq".missing_*].',
                '}',
                ''
            ].join('\n'),
            {
                documentUri: URI.file('/workspace/host-unresolved.rq'),
                validation: false
            }
        );
        const indexed = extractIndexedDocument(host, { ideaCandidates: [] });
        const hostId = ideaId(host.uri.toString(), 'host');
        const unresolved = indexed!.edges.filter(
            edge => edge.sourceId === hostId && edge.isResolved === false
        );
        expect(unresolved.length).toBeGreaterThan(0);
        expect(unresolved.some(edge => edge.label?.includes('missing_*'))).toBe(true);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('e2e: extractIndexedDocument fans out edges for matching catalog ideas', async () => {
        clearDocuments(services.shared, services.shared.workspace.LangiumDocuments.all.toArray());
        const alphaUri = 'file:///workspace/mods/alpha.rq';
        const betaUri = 'file:///workspace/mods/beta.rq';
        const host = await parse(
            [
                'host {',
                '    Related ["./mods/*.rq".widget_*].',
                '}',
                ''
            ].join('\n'),
            {
                documentUri: URI.file('/workspace/host-e2e.rq'),
                validation: false
            }
        );

        const indexed = extractIndexedDocument(host, {
            ideaCandidates: [
                {
                    fileUri: alphaUri,
                    filePath: '/workspace/mods/alpha.rq',
                    ideaName: 'widget_a'
                },
                {
                    fileUri: betaUri,
                    filePath: '/workspace/mods/beta.rq',
                    ideaName: 'widget_b'
                },
                {
                    fileUri: alphaUri,
                    filePath: '/workspace/mods/alpha.rq',
                    ideaName: 'other'
                }
            ]
        });
        const hostId = ideaId(host.uri.toString(), 'host');
        const resolved = [...new Set(
            indexed!.edges
                .filter(edge => edge.sourceId === hostId && edge.isResolved && edge.targetId)
                .map(edge => edge.targetId!)
        )].sort();

        expect(resolved).toEqual([
            ideaId(alphaUri, 'widget_a'),
            ideaId(betaUri, 'widget_b')
        ].sort());
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
    // rq:["../../../reqlan rq/language/imports.rq".idea_path_filter]
    test('e2e: imports.rq extract includes webview and path_filter ideas', async () => {
        clearDocuments(services.shared, services.shared.workspace.LangiumDocuments.all.toArray());
        const importsPath = join(repoDir, 'reqlan rq/language/imports.rq');
        const text = readFileSync(importsPath, 'utf8');
        const document = await parse(text, {
            documentUri: URI.parse(pathToFileURL(importsPath).href),
            validation: false
        });
        const indexed = extractIndexedDocument(document);
        expect(indexed).toBeDefined();
        const names = indexed!.ideas.map(idea => idea.name);
        expect(names).toContain('wildcard_references');
        expect(names).toContain('wildcard_references_webview');
        expect(names).toContain('idea_path_filter');

        const wildcard = indexed!.ideas.find(idea => idea.name === 'wildcard_references');
        expect(wildcard?.kind).toBe('block');
        expect(wildcard?.summary.length).toBeGreaterThan(40);
        expect(JSON.parse(wildcard!.attributesJson).status).toBe('done');

        const webview = indexed!.ideas.find(idea => idea.name === 'wildcard_references_webview');
        expect(webview?.kind).toBe('block');
        expect(webview?.summary).toMatch(/focusIdeaSearch|pathFilter|openWildcardReference/);

        const filter = indexed!.ideas.find(idea => idea.name === 'idea_path_filter');
        expect(filter?.kind).toBe('block');
        expect(filter?.summary.length).toBeGreaterThan(20);
    });
});

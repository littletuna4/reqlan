/**
 * rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".wildcard_refs_toggle]
 * rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
 * rq:["../../../reqlan rq/indexer/indexer.rq".index]
 * rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from '@reqlan/language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { buildGraphViewSlice } from '../src/index-store/webview-graph-queries.js';
import { ideaId } from '../src/core/types.js';

describe('graph wildcard refs toggle', () => {
    let dir: string;
    let dbPath: string;
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'reqlan-wildcard-graph-'));
        dbPath = join(dir, 'ideas-index.sqlite');
        services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper(services.Reqlan);
    });

    afterEach(() => {
        clearDocuments(services.shared, services.shared.workspace.LangiumDocuments.all.toArray());
        rmSync(dir, { recursive: true, force: true });
    });

    // rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".wildcard_refs_toggle]
    test('e2e: includeWildcardRefs false drops wildcard edges from slice', async () => {
        const alphaUri = 'file:///workspace/mods/alpha.rq';
        const hostUri = 'file:///workspace/host.rq';
        const host = await parse(
            [
                'host {',
                '    Exact [exact_friend].',
                '    Wild ["./mods/*.rq".widget_*].',
                '}',
                'exact_friend { friend }',
                ''
            ].join('\n'),
            { documentUri: URI.parse(hostUri), validation: false }
        );
        const indexed = extractIndexedDocument(host, {
            ideaCandidates: [
                {
                    fileUri: alphaUri,
                    filePath: '/workspace/mods/alpha.rq',
                    ideaName: 'widget_a'
                }
            ]
        });
        expect(indexed).toBeDefined();

        // Persist host ideas + a fake target idea row so the graph can resolve nodes.
        writeFileSync(join(dir, 'placeholder'), '');
        const store = await SqliteIndexStore.open(dbPath);
        await store.upsertDocument(hostUri, indexed!.contentHash, indexed!.ideas, indexed!.edges);
        await store.upsertDocument(
            alphaUri,
            'hash-alpha',
            [{
                id: ideaId(alphaUri, 'widget_a'),
                name: 'widget_a',
                kind: 'block',
                fileUri: alphaUri,
                lineStart: 0,
                lineEnd: 0,
                summary: 'matched',
                attributesJson: '{}',
                contentHash: 'hash-alpha'
            }],
            []
        );

        const hostId = ideaId(hostUri, 'host');
        const withWild = await buildGraphViewSlice(store, {
            centerId: hostId,
            includeIndirect: false,
            includeWildcardRefs: true,
            maxNodes: 40
        });
        const withoutWild = await buildGraphViewSlice(store, {
            centerId: hostId,
            includeIndirect: false,
            includeWildcardRefs: false,
            maxNodes: 40
        });

        expect(withWild.edges.some(edge => edge.kind === 'wildcard_reference')).toBe(true);
        expect(withWild.edges.some(edge => edge.kind === 'references')).toBe(true);
        expect(withoutWild.edges.some(edge => edge.kind === 'wildcard_reference')).toBe(false);
        expect(withoutWild.edges.some(edge => edge.kind === 'references')).toBe(true);

        store.closeWithoutPersist();
    });
});

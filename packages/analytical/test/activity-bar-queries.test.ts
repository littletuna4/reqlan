import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from 'reqlan-language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { buildGraphViewSlice } from '../src/index-store/webview-graph-queries.js';
import type { IdeaRecord, EdgeRecord } from '../src/core/types.js';
import { ideaId } from '../src/core/types.js';

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    const services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

async function openTestStore(): Promise<SqliteIndexStore> {
    return SqliteIndexStore.open(join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`));
}

async function seedStore(
    fileUri: string,
    source: string
): Promise<SqliteIndexStore> {
    const document = await parse(source, { validation: false });
    document.uri = URI.parse(fileUri);
    const indexed = extractIndexedDocument(document);
    if (!indexed) {
        throw new Error('Failed to extract document');
    }
    const store = await openTestStore();
    await store.upsertDocument(fileUri, indexed.contentHash, indexed.ideas, indexed.edges);
    return store;
}

describe('activity bar sqlite queries', () => {
    test('getIdeaAtLine returns innermost idea at cursor', async () => {
        const fileUri = 'file:///workspace/test.rq';
        const store = await openTestStore();
        const outerId = ideaId(fileUri, 'outer');
        const innerId = ideaId(fileUri, 'inner');
        await store.upsertDocument(fileUri, 'hash', [
            {
                id: outerId,
                name: 'outer',
                kind: 'block',
                fileUri,
                lineStart: 0,
                lineEnd: 10,
                summary: 'outer',
                attributesJson: '{}',
                contentHash: 'o'
            },
            {
                id: innerId,
                name: 'inner',
                kind: 'block',
                fileUri,
                lineStart: 2,
                lineEnd: 4,
                summary: 'inner',
                attributesJson: '{}',
                contentHash: 'i'
            }
        ], []);

        const atInner = await store.getIdeaAtLine(fileUri, 3);
        expect(atInner?.name).toBe('inner');

        const atOuter = await store.getIdeaAtLine(fileUri, 8);
        expect(atOuter?.name).toBe('outer');
        await store.close();
    });

    test('listReferencesForIdea groups inbound and outbound edges', async () => {
        const fileA = 'file:///workspace/a.rq';
        const fileB = 'file:///workspace/b.rq';
        const store = await openTestStore();

        const ideaA: IdeaRecord = {
            id: ideaId(fileA, 'alpha'),
            name: 'alpha',
            kind: 'block',
            fileUri: fileA,
            lineStart: 0,
            lineEnd: 3,
            summary: 'alpha idea',
            attributesJson: '{}',
            contentHash: 'a'
        };
        const ideaB: IdeaRecord = {
            id: ideaId(fileB, 'beta'),
            name: 'beta',
            kind: 'block',
            fileUri: fileB,
            lineStart: 0,
            lineEnd: 3,
            summary: 'beta idea',
            attributesJson: '{}',
            contentHash: 'b'
        };
        const edge: EdgeRecord = {
            id: `${ideaA.id}->references:${ideaB.id}`,
            sourceId: ideaA.id,
            targetId: ideaB.id,
            kind: 'references',
            label: 'beta',
            isResolved: true
        };

        await store.upsertDocument(fileA, 'ha', [ideaA], [edge]);
        await store.upsertDocument(fileB, 'hb', [ideaB], []);

        const refs = await store.listReferencesForIdea(ideaA.id);
        expect(refs.some(row => row.direction === 'outbound' && row.targetName === 'beta')).toBe(true);

        const inbound = await store.listReferencesForIdea(ideaB.id);
        expect(inbound.some(row => row.direction === 'inbound' && row.targetName === 'alpha')).toBe(true);
        await store.close();
    });

    test('listReferencesForIdea returns bidirectional bracket references in the same file', async () => {
        const fileUri = 'file:///workspace/graph.rq';
        const store = await seedStore(
            fileUri,
            `
reframe_view {
    [manual_reframe]
    [auto_reframe]
}
manual_reframe {
    detail
}
auto_reframe {
    detail
}
`
        );

        const reframeId = ideaId(fileUri, 'reframe_view');
        const manualId = ideaId(fileUri, 'manual_reframe');

        const reframeRefs = await store.listReferencesForIdea(reframeId);
        expect(reframeRefs.some(row => row.direction === 'outbound' && row.label === 'manual_reframe')).toBe(true);
        expect(reframeRefs.some(row => row.direction === 'outbound' && row.label === 'auto_reframe')).toBe(true);
        expect(reframeRefs.some(row => row.direction === 'inbound')).toBe(false);

        const manualRefs = await store.listReferencesForIdea(manualId);
        expect(manualRefs.some(row => row.direction === 'inbound' && row.label === 'manual_reframe')).toBe(true);
        expect(manualRefs.some(row => row.direction === 'outbound')).toBe(false);
        await store.close();
    });

    test('listAncestorChain walks reference parents with depth cap', async () => {
        const file = 'file:///workspace/chain.rq';
        const store = await openTestStore();

        const grand = ideaId(file, 'grand');
        const parent = ideaId(file, 'parent');
        const child = ideaId(file, 'child');

        const ideas: IdeaRecord[] = [
            { id: grand, name: 'grand', kind: 'block', fileUri: file, lineStart: 0, lineEnd: 1, summary: '', attributesJson: '{}', contentHash: 'g' },
            { id: parent, name: 'parent', kind: 'block', fileUri: file, lineStart: 2, lineEnd: 3, summary: '', attributesJson: '{"status":"todo"}', contentHash: 'p' },
            { id: child, name: 'child', kind: 'block', fileUri: file, lineStart: 4, lineEnd: 5, summary: '', attributesJson: '{}', contentHash: 'c' }
        ];
        const edges: EdgeRecord[] = [
            { id: 'e1', sourceId: parent, targetId: grand, kind: 'references', label: 'grand', isResolved: true },
            { id: 'e2', sourceId: child, targetId: parent, kind: 'references', label: 'parent', isResolved: true }
        ];

        await store.upsertDocument(file, 'chain', ideas, edges);

        const result = await store.buildAncestorChainResult(child);
        expect(result.ancestors.map(idea => idea.name)).toEqual(['parent', 'grand']);
        expect(result.blocking.some(idea => idea.name === 'parent')).toBe(true);
        expect(result.statusRollup.todo).toBe(1);
        await store.close();
    });

    test('buildGraphViewSlice respects activity bar maxNodes cap', async () => {
        const file = 'file:///workspace/graph.rq';
        const store = await openTestStore();
        const ideas: IdeaRecord[] = [];
        const edges: EdgeRecord[] = [];
        const center = ideaId(file, 'center');
        ideas.push({
            id: center,
            name: 'center',
            kind: 'block',
            fileUri: file,
            lineStart: 0,
            lineEnd: 1,
            summary: '',
            attributesJson: '{}',
            contentHash: 'center'
        });
        for (let index = 0; index < 50; index++) {
            const id = ideaId(file, `n${index}`);
            ideas.push({
                id,
                name: `n${index}`,
                kind: 'block',
                fileUri: file,
                lineStart: index + 2,
                lineEnd: index + 3,
                summary: '',
                attributesJson: '{}',
                contentHash: `h${index}`
            });
            edges.push({
                id: `e${index}`,
                sourceId: center,
                targetId: id,
                kind: 'references',
                label: `n${index}`,
                isResolved: true
            });
        }
        await store.upsertDocument(file, 'graph', ideas, edges);

        const slice = await buildGraphViewSlice(store, {
            centerId: center,
            includeIndirect: false,
            maxNodes: 40
        });
        expect(slice.nodes.length).toBeLessThanOrEqual(40);
        expect(slice.truncated).toBe(true);
        await store.close();
    });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from '@reqlan/language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { ideaId } from '../src/core/types.js';
import { normalizeIndexedDocument } from '../src/core/workspace-paths.js';

const graphRqPath = join(
    import.meta.dirname,
    '../../../reqlan rq/extension/library/graph.rq'
);
const workspaceRoot = join(import.meta.dirname, '../../..');
const fileUri = 'reqlan rq/extension/library/graph.rq';

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    const services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper(services.Reqlan);
});

async function indexGraphRq(): Promise<SqliteIndexStore> {
    const source = readFileSync(graphRqPath, 'utf8');
    const document = await parse(source, { validation: false });
    document.uri = URI.parse(URI.file(graphRqPath).toString());
    const indexedRaw = extractIndexedDocument(document);
    if (!indexedRaw) {
        throw new Error('Failed to index graph.rq');
    }
    const indexed = normalizeIndexedDocument(indexedRaw, workspaceRoot);
    const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`));
    await store.upsertDocument(indexed.fileUri, indexed.contentHash, indexed.ideas, indexed.edges);
    return store;
}

describe('graph.rq references', () => {
    test('reframe_view has three resolved outbound references in the index', async () => {
        const source = readFileSync(graphRqPath, 'utf8');
        const document = await parse(source, { validation: false });
        document.uri = URI.parse(URI.file(graphRqPath).toString());
        const indexedRaw = extractIndexedDocument(document);
        expect(indexedRaw).toBeDefined();
        const indexed = normalizeIndexedDocument(indexedRaw!, workspaceRoot);

        const reframeId = ideaId(fileUri, 'reframe_view');
        const outbound = indexed.edges.filter(
            edge => edge.sourceId === reframeId && edge.kind === 'references'
        );
        expect([...new Set(outbound.map(edge => edge.label))].sort()).toEqual([
            'auto_reframe',
            'manual_reframe',
            'reframe_animation'
        ]);
        expect(outbound.every(edge => edge.isResolved !== false && edge.targetId)).toBe(true);

        const store = await indexGraphRq();
        const refs = await store.listReferencesForIdea(reframeId);
        const outboundRefs = refs.filter(row => row.direction === 'outbound' && row.kind === 'references');
        expect(outboundRefs.map(row => row.label).sort()).toEqual([
            'auto_reframe',
            'manual_reframe',
            'reframe_animation'
        ]);
        expect([...new Set(refs.filter(row => row.direction === 'inbound' && row.kind === 'references').map(row => row.label))]).toEqual([
            'reframe_view'
        ]);
        await store.close();
    });

    test('getIdeaAtLine selects reframe_view throughout its body', async () => {
        const store = await indexGraphRq();
        const ideas = await store.listIdeasInFileWithRanges(fileUri);
        const reframe = ideas.find(idea => idea.name === 'reframe_view');
        const manual = ideas.find(idea => idea.name === 'manual_reframe');
        expect(reframe).toBeDefined();
        expect(manual).toBeDefined();

        // Sample across the idea body (0-based), not only the header line.
        const bodyLines = [
            reframe!.lineStart,
            Math.floor((reframe!.lineStart + reframe!.lineEnd) / 2),
            reframe!.lineEnd
        ];
        for (const line of bodyLines) {
            const idea = await store.getIdeaAtLine(fileUri, line);
            expect(idea?.name, `line ${line}`).toBe('reframe_view');
        }

        expect((await store.getIdeaAtLine(fileUri, manual!.lineStart))?.name).toBe('manual_reframe');
        await store.close();
    });
});

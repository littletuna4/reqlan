import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from 'reqlan-language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { ideaId } from '../src/core/types.js';
import { normalizeIndexedDocument } from '../src/core/workspace-paths.js';
import { filterReferences, groupReferences, buildReferencesPayloadFromCurrentFile } from '../../extension/src/activity_bar_module/context-helpers.js';
import { resolveBidirectionalIdeaReferences } from '../src/core/idea-references.js';

const graphRqPath = join(import.meta.dirname, '../../../reqlan rq/extension/library/graph.rq');
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

describe('activity bar references payload', () => {
    test('reframe_view references pane payload includes three outbound idea refs', async () => {
        const store = await indexGraphRq();
        const reframeId = ideaId(fileUri, 'reframe_view');
        const rows = filterReferences(await store.listReferencesForIdea(reframeId));
        const grouped = groupReferences(rows);
        const ideaRefs = grouped.references ?? [];

        expect(ideaRefs.filter(row => row.direction === 'outbound').map(row => row.label).sort()).toEqual([
            'auto_reframe',
            'manual_reframe',
            'reframe_animation'
        ]);
        expect(rows.length).toBeGreaterThan(0);
        await store.close();
    });

    test('context current-file slice exposes three outbound refs for reframe_view', async () => {
        const store = await indexGraphRq();
        const reframeId = ideaId(fileUri, 'reframe_view');
        const related = await resolveBidirectionalIdeaReferences(store, reframeId);
        const payload = buildReferencesPayloadFromCurrentFile(reframeId, {
            inboundReferencingIdeas: related.inbound,
            referencedIdeas: related.outbound
        });
        expect(payload.rows.filter(row => row.direction === 'outbound').map(row => row.label).sort()).toEqual([
            'auto_reframe',
            'manual_reframe',
            'reframe_animation'
        ]);
        await store.close();
    });
});

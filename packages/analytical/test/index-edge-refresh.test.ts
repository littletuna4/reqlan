import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createReqlanServices } from 'reqlan-language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';
import { normalizeIndexedDocument } from '../src/core/workspace-paths.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { ideaId } from '../src/core/types.js';

const graphRqPath = join(import.meta.dirname, '../../../reqlan rq/extension/library/graph.rq');
const workspaceRoot = join(import.meta.dirname, '../../..');

describe('index edge refresh', () => {
    test('re-upserts edges when content hash matches but stored edges are missing', async () => {
        const services = createReqlanServices({ ...NodeFileSystem });
        const text = readFileSync(graphRqPath, 'utf8');
        const doc = services.shared.workspace.LangiumDocumentFactory.fromString(text, URI.file(graphRqPath));
        await services.shared.workspace.DocumentBuilder.build([doc], { validation: false });
        const indexed = normalizeIndexedDocument(extractIndexedDocument(doc)!, workspaceRoot);

        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`));
        await store.upsertDocument(indexed.fileUri, indexed.contentHash, indexed.ideas, []);
        expect(await store.countEdgesFromFile(indexed.fileUri)).toBe(0);

        await store.upsertDocument(indexed.fileUri, indexed.contentHash, indexed.ideas, indexed.edges);
        expect(await store.countEdgesFromFile(indexed.fileUri)).toBeGreaterThan(0);

        const reframeId = ideaId(indexed.fileUri, 'reframe_view');
        const refs = await store.listReferencesForIdea(reframeId);
        expect(
            refs.filter(row => row.direction === 'outbound' && row.kind === 'references').map(row => row.label).sort()
        ).toEqual(['auto_reframe', 'manual_reframe', 'reframe_animation']);
        await store.close();
    });
});

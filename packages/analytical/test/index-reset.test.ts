import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { ideaId } from '../src/core/types.js';

const exampleIdea = (fileUri: string) => ({
    id: ideaId(fileUri, 'example'),
    name: 'example',
    kind: 'requirement' as const,
    fileUri,
    lineStart: 1,
    lineEnd: 2,
    summary: 'Example idea',
    attributesJson: '{}',
    contentHash: 'hash-1'
});

describe('index reset', () => {
    test('closeWithoutPersist then deleteDatabaseFile matches clear and rebuild', async () => {
        const dbPath = join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`);
        const fileUri = 'file:///workspace/example.rq';
        const store = await SqliteIndexStore.open(dbPath);
        await store.upsertDocument(fileUri, 'hash-1', [exampleIdea(fileUri)], []);
        expect((await store.counts()).ideas).toBe(1);

        store.closeWithoutPersist();
        await SqliteIndexStore.deleteDatabaseFile(dbPath);

        const fresh = await SqliteIndexStore.open(dbPath);
        expect(await fresh.counts()).toEqual({ ideas: 0, edges: 0 });
        await fresh.close();
    });

    test('deleteDatabaseFile removes the index file so reopen starts empty', async () => {
        const dbPath = join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`);
        const store = await SqliteIndexStore.open(dbPath);
        const fileUri = 'file:///workspace/example.rq';
        await store.upsertDocument(fileUri, 'hash-1', [exampleIdea(fileUri)], []);
        expect((await store.counts()).ideas).toBe(1);
        await store.close();

        await SqliteIndexStore.deleteDatabaseFile(dbPath);

        const fresh = await SqliteIndexStore.open(dbPath);
        expect(await fresh.counts()).toEqual({ ideas: 0, edges: 0 });
        await fresh.close();
    });

    test('deleteDatabaseFile recovers from a corrupted on-disk database', async () => {
        const dbPath = join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`);
        const store = await SqliteIndexStore.open(dbPath);
        await store.upsertDocument('file:///workspace/example.rq', 'hash-1', [exampleIdea('file:///workspace/example.rq')], []);
        await store.close();

        const bytes = await readFile(dbPath);
        await writeFile(dbPath, bytes.subarray(0, Math.floor(bytes.length / 2)));

        await expect(SqliteIndexStore.open(dbPath)).rejects.toThrow(/malformed/i);

        await SqliteIndexStore.deleteDatabaseFile(dbPath);

        const fresh = await SqliteIndexStore.open(dbPath);
        expect(await fresh.counts()).toEqual({ ideas: 0, edges: 0 });
        await fresh.close();
    });

    test('deleteDatabaseFile removes corrupt file that never opened successfully', async () => {
        const dbPath = join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`);
        await writeFile(dbPath, Buffer.from('not a sqlite database'));

        await expect(SqliteIndexStore.open(dbPath)).rejects.toThrow();
        await SqliteIndexStore.deleteDatabaseFile(dbPath);
        await expect(access(dbPath)).rejects.toMatchObject({ code: 'ENOENT' });

        const fresh = await SqliteIndexStore.open(dbPath);
        expect(await fresh.counts()).toEqual({ ideas: 0, edges: 0 });
        await fresh.close();
    });
});

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { edgeId, ideaId, type EdgeRecord, type IdeaRecord } from '../src/core/types.js';

async function openTestStore(): Promise<SqliteIndexStore> {
    return SqliteIndexStore.open(join(tmpdir(), `reqlan-refs-${randomUUID()}.sqlite`));
}

describe('listReferencesPage file target resolution', () => {
    test('resolves authored relative file targets against the defining file', async () => {
        const fileUri = 'reqlan rq/extension/module/activitybar.rq';
        const sourceId = ideaId(fileUri, 'loading_state');
        const idea: IdeaRecord = {
            id: sourceId,
            name: 'loading_state',
            kind: 'block',
            fileUri,
            lineStart: 10,
            lineEnd: 20,
            summary: 'loading',
            attributesJson: '{}',
            contentHash: 'hash'
        };
        const targetFile = '../../../packages/extension/src/foo.ts';
        const edge: EdgeRecord = {
            id: edgeId(sourceId, 'file_reference', targetFile),
            sourceId,
            kind: 'file_reference',
            targetFile,
            label: targetFile,
            sourceLine: 12,
            isResolved: true
        };

        const store = await openTestStore();
        await store.upsertDocument(fileUri, 'hash', [idea], [edge]);

        const rows = await store.listReferencesPage({ page: 0, pageSize: 50 });
        expect(rows).toHaveLength(1);
        expect(rows[0]!.targetPath).toBe('packages/extension/src/foo.ts');
        expect(rows[0]!.targetFileUri).toBe('packages/extension/src/foo.ts');
        expect(rows[0]!.sourcePath).toBe(fileUri);
        expect(rows[0]!.referenceType).toBe('file');

        await store.close();
    });

    test('keeps idea-target paths from the joined idea file_uri', async () => {
        const sourceFile = 'a/source.rq';
        const targetFile = 'b/target.rq';
        const sourceId = ideaId(sourceFile, 'src');
        const targetId = ideaId(targetFile, 'dst');
        const ideas: IdeaRecord[] = [
            {
                id: sourceId,
                name: 'src',
                kind: 'block',
                fileUri: sourceFile,
                lineStart: 1,
                lineEnd: 3,
                summary: '',
                attributesJson: '{}',
                contentHash: 'h1'
            },
            {
                id: targetId,
                name: 'dst',
                kind: 'block',
                fileUri: targetFile,
                lineStart: 1,
                lineEnd: 3,
                summary: '',
                attributesJson: '{}',
                contentHash: 'h2'
            }
        ];
        const edge: EdgeRecord = {
            id: edgeId(sourceId, 'references', targetId),
            sourceId,
            targetId,
            kind: 'references',
            label: 'dst',
            sourceLine: 2,
            isResolved: true
        };

        const store = await openTestStore();
        await store.upsertDocument(sourceFile, 'h1', [ideas[0]!], [edge]);
        await store.upsertDocument(targetFile, 'h2', [ideas[1]!], []);

        const rows = await store.listReferencesPage({ page: 0, pageSize: 50 });
        const ideaRef = rows.find(row => row.referenceType === 'sub-idea');
        expect(ideaRef?.targetPath).toBe(targetFile);

        await store.close();
    });
});

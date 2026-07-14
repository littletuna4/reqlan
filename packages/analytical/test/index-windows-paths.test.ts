import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { toWorkspaceRelativePath } from '../src/core/workspace-paths.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { ideaId, type IdeaRecord } from '../src/core/types.js';

const workspaceRoot = 'C:\\Users\\tony\\reqlan';
const relativeFileUri = 'reqlan rq/extension/scope.rq';
const windowsAbsoluteUri = 'C:\\Users\\tony\\reqlan\\reqlan rq\\extension\\scope.rq';

function mockIdea(name: string, fileUri: string): IdeaRecord {
    return {
        id: ideaId(fileUri, name),
        name,
        kind: 'block',
        fileUri,
        lineStart: 0,
        lineEnd: 1,
        summary: name,
        attributesJson: '{}',
        contentHash: 'abc123'
    };
}

describe('index upsert on Windows paths', () => {
    test('toIndexFileUri and normalize agree on Windows fsPath', () => {
        const fromFsPath = toWorkspaceRelativePath(windowsAbsoluteUri, workspaceRoot);
        const fromFileUri = toWorkspaceRelativePath(
            'file:///c%3A/Users/tony/reqlan/reqlan%20rq/extension/scope.rq',
            workspaceRoot
        );
        expect(fromFsPath).toBe(relativeFileUri);
        expect(fromFileUri).toBe(relativeFileUri);
    });

    test('re-upsert deletes prior ideas when file_uri is consistent', async () => {
        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`));
        const ideasV1 = [mockIdea('context_scope', relativeFileUri)];
        await store.upsertDocument(relativeFileUri, 'hash1', ideasV1, []);

        const ideasV2 = [mockIdea('context_scope', relativeFileUri), mockIdea('any_file_scope', relativeFileUri)];
        await store.upsertDocument(relativeFileUri, 'hash2', ideasV2, []);

        const stored = await store.getIdeasInFile(relativeFileUri);
        expect(stored.map(idea => idea.name).sort()).toEqual(['any_file_scope', 'context_scope']);
        await store.close();
    });

    test('renamed idea replaces old row on re-upsert', async () => {
        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-test-${randomUUID()}.sqlite`));
        await store.upsertDocument(relativeFileUri, 'hash1', [mockIdea('old_name', relativeFileUri)], []);
        await store.upsertDocument(relativeFileUri, 'hash2', [mockIdea('new_name', relativeFileUri)], []);

        const stored = await store.getIdeasInFile(relativeFileUri);
        expect(stored.map(idea => idea.name)).toEqual(['new_name']);
        await store.close();
    });
});

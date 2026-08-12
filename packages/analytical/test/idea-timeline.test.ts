import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { ideaId, type IdeaRecord } from '../src/core/types.js';

function mockIdea(name: string, fileUri: string, overrides: Partial<IdeaRecord> = {}): IdeaRecord {
    return {
        id: ideaId(fileUri, name),
        name,
        kind: 'block',
        fileUri,
        lineStart: 0,
        lineEnd: 4,
        summary: `${name} summary`,
        attributesJson: JSON.stringify({ status: 'done', tags: ['timeline'] }),
        contentHash: 'hash',
        ...overrides
    };
}

describe('idea timeline git dates', () => {
    // rq:["../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".timeline_page]
    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
    test('upsert preserves analyser git dates and change count across reindex', async () => {
        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-timeline-${randomUUID()}.sqlite`));
        const fileUri = 'file:///workspace/timeline.rq';
        const idea = mockIdea('timeline_page', fileUri);
        await store.upsertDocument(fileUri, 'hash1', [idea], []);
        await store.updateGitDates(idea.id, '2024-01-01T00:00:00Z', '2025-06-01T00:00:00Z', 7);

        await store.upsertDocument(fileUri, 'hash2', [{ ...idea, contentHash: 'hash2', summary: 'Updated summary' }], []);

        const stored = await store.getIdea(idea.id);
        expect(stored?.gitCreatedAt).toBe('2024-01-01T00:00:00Z');
        expect(stored?.gitModifiedAt).toBe('2025-06-01T00:00:00Z');
        expect(stored?.gitChangeCount).toBe(7);
        expect(stored?.summary).toBe('Updated summary');
        await store.close();
    });

    test('listRecentGitIdeaEvents emits created and modified with idea metadata', async () => {
        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-timeline-${randomUUID()}.sqlite`));
        const fileUri = 'file:///workspace/timeline.rq';
        const idea = mockIdea('timeline_page', fileUri);
        await store.upsertDocument(fileUri, 'hash1', [idea], []);
        await store.updateGitDates(idea.id, '2024-01-01T00:00:00Z', '2025-06-01T00:00:00Z', 3);

        const events = await store.listRecentGitIdeaEvents(20);
        expect(events.map(event => event.kind)).toEqual(['modified', 'created']);
        expect(events[0]).toMatchObject({
            name: 'timeline_page',
            kind: 'modified',
            at: '2025-06-01T00:00:00Z',
            status: 'done',
            summary: 'timeline_page summary',
            ideaKind: 'block'
        });
        expect(events[0]?.tags).toContain('timeline');
        expect(events[1]).toMatchObject({
            kind: 'created',
            at: '2024-01-01T00:00:00Z'
        });
        await store.close();
    });

    // rq:["../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    test('listIdeaIdsMissingGitDates returns ideas without dates', async () => {
        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-timeline-${randomUUID()}.sqlite`));
        const fileUri = 'file:///workspace/timeline.rq';
        const withDates = mockIdea('dated', fileUri);
        const missing = mockIdea('undated', fileUri, { lineStart: 10, lineEnd: 12 });
        await store.upsertDocument(fileUri, 'hash1', [withDates, missing], []);
        await store.updateGitDates(withDates.id, '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z', 2);

        const ids = await store.listIdeaIdsMissingGitDates(10);
        expect(ids).toEqual([missing.id]);
        await store.close();
    });

    // rq:["../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    // rq:["../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
    // rq:["../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
    // rq:["../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
    test('listIdeaIdsMissingGitDates includes ideas missing change count', async () => {
        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-timeline-${randomUUID()}.sqlite`));
        const fileUri = 'file:///workspace/timeline.rq';
        const datedOnly = mockIdea('dated_no_count', fileUri);
        await store.upsertDocument(fileUri, 'hash1', [datedOnly], []);
        await store.updateGitDates(datedOnly.id, '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');

        const ids = await store.listIdeaIdsMissingGitDates(10);
        expect(ids).toEqual([datedOnly.id]);
        await store.close();
    });

    // rq:["../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    // rq:["../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
    // rq:["../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
    test('listIdeaIdsMissingGitDates can filter or prefer a file', async () => {
        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-timeline-${randomUUID()}.sqlite`));
        const current = 'reqlan rq/current.rq';
        const other = 'reqlan rq/other.rq';
        const currentIdea = mockIdea('current_undated', current);
        const otherIdea = mockIdea('other_undated', other);
        await store.upsertDocument(current, 'hash-a', [currentIdea], []);
        await store.upsertDocument(other, 'hash-b', [otherIdea], []);

        expect(await store.listIdeaIdsMissingGitDates(10, { fileUri: current })).toEqual([currentIdea.id]);
        expect(await store.listIdeaIdsMissingGitDates(10, { preferFileUri: current })).toEqual([
            currentIdea.id,
            otherIdea.id
        ]);
        expect(await store.listIdeaIdsMissingGitDates(10, { preferFileUri: other })).toEqual([
            otherIdea.id,
            currentIdea.id
        ]);
        await store.close();
    });

    test('listIdeasPage returns indexed git columns', async () => {
        const store = await SqliteIndexStore.open(join(tmpdir(), `reqlan-timeline-${randomUUID()}.sqlite`));
        const fileUri = 'file:///workspace/ideas.rq';
        const idea = mockIdea('ideas_list', fileUri);
        await store.upsertDocument(fileUri, 'hash1', [idea], []);
        await store.updateGitDates(idea.id, '2024-03-01T00:00:00Z', '2024-04-01T00:00:00Z', 5);

        const rows = await store.listIdeasPage({
            page: 0,
            pageSize: 50,
            attributeColumns: [],
            referenceFilters: []
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            title: 'ideas_list',
            gitCreatedAt: '2024-03-01T00:00:00Z',
            gitModifiedAt: '2024-04-01T00:00:00Z',
            gitChangeCount: 5
        });
        await store.close();
    });
});

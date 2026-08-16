import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { WorkspaceIndex } from '../src/index-store/workspace-index.js';

async function writeWorkspace(files: Record<string, string>): Promise<string> {
    const root = join(tmpdir(), `reqlan-index-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    for (const [relativePath, contents] of Object.entries(files)) {
        const fullPath = join(root, relativePath);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, contents, 'utf8');
    }
    return root;
}

/** Newest-first document updates recorded in the diagnostics DB (via native). */
function documentUpdates(index: WorkspaceIndex) {
    return index.getStatusSnapshot().recentDocumentUpdates;
}

describe('WorkspaceIndex', () => {
    test('indexes ideas and skips re-index when hash matches and edges are present', async () => {
        const root = await writeWorkspace({
            'demo.rq': 'alpha this is alpha\nbeta this is beta\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        expect(index.isReady).toBe(true);
        expect((await index.indexStore.counts()).ideas).toBe(2);

        const before = documentUpdates(index).length;
        await index.indexFilePath(join(root, 'demo.rq'));
        expect(documentUpdates(index).length).toBe(before);
        await index.deactivate();
    });

    test('soft sync skips unchanged files by stored mtime', async () => {
        const root = await writeWorkspace({
            'a.rq': 'alpha this is alpha\n',
            'b.rq': 'beta this is beta\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        const updatesAfterActivate = documentUpdates(index).length;
        const ok = await index.syncWorkspace([join(root, 'a.rq'), join(root, 'b.rq')]);
        expect(ok).toBe(true);
        expect(documentUpdates(index).length).toBe(updatesAfterActivate);
        expect((await index.indexStore.counts()).ideas).toBe(2);
        await index.deactivate();
    });

    test('soft sync reindexes when mtime changes', async () => {
        const root = await writeWorkspace({
            'demo.rq': 'alpha this is alpha\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        const filePath = join(root, 'demo.rq');
        await writeFile(filePath, 'alpha this is alpha\ngamma this is gamma\n', 'utf8');
        const later = new Date(Date.now() + 5_000);
        await utimes(filePath, later, later);

        const before = documentUpdates(index).length;
        await index.syncWorkspace([filePath]);
        expect(documentUpdates(index).length).toBeGreaterThan(before);
        expect((await index.indexStore.counts()).ideas).toBe(2);
        await index.deactivate();
    });

    test('enqueueIndex indexes only the changed file', async () => {
        const root = await writeWorkspace({
            'a.rq': 'alpha this is alpha\n',
            'b.rq': 'beta this is beta\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        await writeFile(join(root, 'a.rq'), 'alpha this is alpha\nalpha_two this is two\n', 'utf8');
        index.enqueueIndex(join(root, 'a.rq'), 'changed');
        // Drain the sync queue by awaiting a follow-up soft sync (mtime skip for b).
        await index.syncWorkspace([join(root, 'a.rq'), join(root, 'b.rq')]);

        const updates = documentUpdates(index);
        expect(updates.some(update => update.fileUri === 'a.rq' || update.fileUri.endsWith('a.rq'))).toBe(true);
        expect((await index.indexStore.counts()).ideas).toBe(3);
        await index.deactivate();
    });

    test('cancelSync stops an in-flight soft sync and stays ready', async () => {
        const files: Record<string, string> = {};
        for (let i = 0; i < 40; i++) {
            files[`f${i}.rq`] = `idea${i} summary ${i}\n`;
        }
        const root = await writeWorkspace(files);
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.open();

        const paths = Object.keys(files).map(name => join(root, name));
        const syncPromise = index.syncWorkspace(paths);
        let sawProgress = false;
        const unsub = index.subscribeStatusUpdates(() => {
            const progress = index.getStatusSnapshot().syncProgress;
            if (progress && progress.processed > 0) {
                sawProgress = true;
                index.cancelSync();
            }
        });
        const ok = await syncPromise;
        unsub();
        expect(sawProgress).toBe(true);
        expect(ok).toBe(true);
        expect(index.isReady).toBe(true);
        expect(index.getStatusSnapshot().syncProgress).toBeUndefined();
        await index.deactivate();
    });

    test('sync progress reports currentFile while indexing', async () => {
        const root = await writeWorkspace({
            'one.rq': 'one this is one\n',
            'two.rq': 'two this is two\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.open();

        const seenFiles = new Set<string>();
        const unsub = index.subscribeStatusUpdates(() => {
            const current = index.getStatusSnapshot().syncProgress?.currentFile;
            if (current) {
                seenFiles.add(current);
            }
        });
        await index.syncWorkspace([join(root, 'one.rq'), join(root, 'two.rq')]);
        unsub();
        expect(seenFiles.has('one.rq')).toBe(true);
        expect(seenFiles.has('two.rq')).toBe(true);
        await index.deactivate();
    });

    test('records parse issues for invalid rq content', async () => {
        const root = await writeWorkspace({
            'bad.rq': '@@@ not valid reqlan at all {\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.open();
        await index.indexFilePath(join(root, 'bad.rq'));

        const issues = index.getStatusSnapshot().fileIssues;
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some(issue => issue.phase === 'parse' || issue.phase === 'extract')).toBe(true);
        await index.deactivate();
    });

    test('migrateRenamedFile clears old uri and indexes the destination', async () => {
        const root = await writeWorkspace({
            'old.rq': 'legacy this was legacy\n',
            'new.rq': 'fresh this is fresh\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        const oldUri = index.toIndexedUri(join(root, 'old.rq'));
        expect(await index.indexStore.getIdeasInFile(oldUri)).toHaveLength(1);

        await index.migrateRenamedFile(oldUri, join(root, 'new.rq'));

        expect(await index.indexStore.getIdeasInFile(oldUri)).toHaveLength(0);
        const newUri = index.toIndexedUri(join(root, 'new.rq'));
        const ideas = await index.indexStore.getIdeasInFile(newUri);
        expect(ideas.map(idea => idea.name)).toContain('fresh');
        await index.deactivate();
    });

    test('clearAndRebuildIndex empties then resyncs', async () => {
        const root = await writeWorkspace({
            'demo.rq': 'alpha this is alpha\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();
        expect((await index.indexStore.counts()).ideas).toBe(1);

        const ok = await index.clearAndRebuildIndex([join(root, 'demo.rq')]);
        expect(ok).toBe(true);
        expect((await index.indexStore.counts()).ideas).toBe(1);
        await index.deactivate();
    });

    test('checkStaleFiles is a no-op when mtimes match', async () => {
        const root = await writeWorkspace({
            'a.rq': 'alpha this is alpha\n',
            'b.rq': 'beta this is beta\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        const updatesBefore = documentUpdates(index).length;
        const states: string[] = [];
        const unsub = index.subscribeStatusUpdates(() => {
            states.push(index.state);
        });
        const result = await index.checkStaleFiles([join(root, 'a.rq'), join(root, 'b.rq')]);
        unsub();

        expect(result).toEqual({ checked: 2, indexed: 0, removed: 0 });
        expect(documentUpdates(index).length).toBe(updatesBefore);
        expect(states.includes('syncing')).toBe(false);
        await index.deactivate();
    });

    test('checkStaleFiles indexes only dirty files and removes missing docs', async () => {
        const root = await writeWorkspace({
            'keep.rq': 'keep this stays\n',
            'gone.rq': 'gone this will vanish\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();
        expect((await index.indexStore.counts()).ideas).toBe(2);

        const keepPath = join(root, 'keep.rq');
        await writeFile(keepPath, 'keep this stays\nkeep_two this is new\n', 'utf8');
        const later = new Date(Date.now() + 5_000);
        await utimes(keepPath, later, later);

        const result = await index.checkStaleFiles([keepPath]);
        expect(result.checked).toBe(1);
        expect(result.indexed).toBe(1);
        expect(result.removed).toBe(1);
        expect((await index.indexStore.counts()).ideas).toBe(2);
        const keepIdeas = await index.indexStore.getIdeasInFile(index.toIndexedUri(keepPath));
        expect(keepIdeas.map(idea => idea.name).sort()).toEqual(['keep', 'keep_two']);
        await index.deactivate();
    });

    // rq:["../../reqlan rq/extension/configuration.rq".configuration_rqignore]
    // rq:["../../reqlan rq/extension/module/index.rq".rqignore]
    test('skips .rq files under rqignore patterns', async () => {
        const root = await writeWorkspace({
            'keep.rq': 'keep this stays\n',
            'venv/hidden.rq': 'hidden should skip\n',
            'node_modules/pkg/dep.rq': 'dep should skip\n'
        });
        await mkdir(join(root, '.reqlan'), { recursive: true });
        await writeFile(join(root, '.reqlan', '.rqignore'), 'custom_drop/\n', 'utf8');
        await mkdir(join(root, 'custom_drop'), { recursive: true });
        await writeFile(join(root, 'custom_drop', 'x.rq'), 'dropped idea\n', 'utf8');

        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        expect((await index.indexStore.counts()).ideas).toBe(1);
        const keepIdeas = await index.indexStore.getIdeasInFile(index.toIndexedUri(join(root, 'keep.rq')));
        expect(keepIdeas.map(idea => idea.name)).toEqual(['keep']);
        await index.deactivate();
    });

    // rq:["../../reqlan rq/core_analysis/search.rq".fuzzy_search]
    test('fuzzySearch ranks from the native index without listing all ideas in JS', async () => {
        const root = await writeWorkspace({
            'demo.rq': 'cli_package CLI package\nsearch_code_actions code action search\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        const empty = index.fuzzySearch('   ', { limit: 8, requireQuery: true });
        expect(empty.hits).toEqual([]);
        expect(empty.total).toBe(0);

        const result = index.fuzzySearch('cli package', { limit: 8, requireQuery: true });
        expect(result.hits[0]?.name).toBe('cli_package');
        expect(result.hits.every(hit => hit.kind !== 'ideaset')).toBe(true);
        await index.deactivate();
    });

    // rq:["../../reqlan rq/core_analysis/search.rq".file_search]
    // rq:["../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
    test('fuzzySearch returns file-name hits and pages with offset', async () => {
        const root = await writeWorkspace({
            'core_analysis/search.rq': 'alpha {\n    body\n}\n',
            'other.rq': 'beta {\n    body\n}\n'
        });
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();

        const uris = await index.indexStore.listDocumentUris();
        expect(uris.sort()).toEqual(['core_analysis/search.rq', 'other.rq']);
        const result = index.fuzzySearch('search', { limit: 8, requireQuery: true });
        expect(result.hits.some(hit => hit.kind === 'file' && hit.name === 'search.rq')).toBe(true);

        const page = index.fuzzySearch('a', { limit: 1, offset: 0, requireQuery: true });
        expect(page.hits).toHaveLength(1);
        if (page.truncated) {
            const next = index.fuzzySearch('a', { limit: 1, offset: 1, requireQuery: true });
            expect(next.hits.length).toBeGreaterThan(0);
            expect(next.hits[0]?.id).not.toBe(page.hits[0]?.id);
        }
        await index.deactivate();
    });
});

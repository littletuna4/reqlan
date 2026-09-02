/**
 * SQLite artifact open/dispose must release file locks so callers can delete bases.
 * rq:["../../../reqlan rq/extension/sqlite-artifact-lifecycle.rq".sqlite_artifact_lifecycle]
 * rq:["../../../reqlan rq/extension/sqlite-artifact-lifecycle.rq".analysis_api_dispose]
 * rq:["../../../reqlan rq/extension/sqlite-artifact-lifecycle.rq".release_when_idle]
 */
import { afterEach, describe, expect, test } from 'vitest';
import { mkdir, writeFile, unlink, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { BaseRegistry } from '../src/index-store/base-registry.js';
import { WorkspaceIndex } from '../src/index-store/workspace-index.js';
import {
    APPLICATION_MEMORY_DIR,
    IDEAS_INDEX_FILENAME,
    INDEX_DIAGNOSTICS_FILENAME
} from '../src/core/application-memory.js';
import {
    nativeEngineAvailable,
    openAnalysisApi,
    resetNativeEngineCache
} from '../src/index.js';

async function writeBase(root: string, files: Record<string, string>): Promise<void> {
    await mkdir(join(root, APPLICATION_MEMORY_DIR), { recursive: true });
    for (const [relativePath, contents] of Object.entries(files)) {
        const fullPath = join(root, relativePath);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, contents, 'utf8');
    }
}

async function expectUnlinkable(path: string): Promise<void> {
    await access(path);
    await unlink(path);
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
}

describe('SQLite artifact release', () => {
    afterEach(() => {
        resetNativeEngineCache();
    });

    test('dispose releases ideas-index so the file can be unlinked', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = join(tmpdir(), `reqlan-dispose-${randomUUID()}`);
        await writeBase(root, { 'demo.rq': 'alpha this is alpha\n' });
        const dbPath = join(root, APPLICATION_MEMORY_DIR, IDEAS_INDEX_FILENAME);

        const opened = await openAnalysisApi({ workspaceRoot: root });
        expect(opened.engine).toBe('native');
        const ideas = await opened.api.listRequirements(8);
        expect(ideas.some(idea => idea.name === 'alpha')).toBe(true);
        await access(dbPath);

        await opened.dispose();
        await expectUnlinkable(dbPath);
        await rm(root, { recursive: true, force: true });
    });

    test('WorkspaceIndex deactivate releases sqlite artifacts', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = join(tmpdir(), `reqlan-wi-release-${randomUUID()}`);
        await writeBase(root, { 'demo.rq': 'alpha this is alpha\n' });
        const storage = join(root, APPLICATION_MEMORY_DIR);
        const ideasPath = join(storage, IDEAS_INDEX_FILENAME);
        const diagnosticsPath = join(storage, INDEX_DIAGNOSTICS_FILENAME);

        const index = new WorkspaceIndex(storage, root);
        await index.activate();
        expect(index.isReady).toBe(true);
        await access(ideasPath);
        await access(diagnosticsPath);

        await index.deactivate();
        expect(index.state).toBe('uninitialized');
        await expectUnlinkable(ideasPath);
        await expectUnlinkable(diagnosticsPath);
        await rm(root, { recursive: true, force: true });
    });

    test('BaseRegistry releaseArtifacts closes handles but keeps descriptors', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = join(tmpdir(), `reqlan-reg-release-${randomUUID()}`);
        await writeBase(root, { 'demo.rq': 'alpha this is alpha\n' });
        const ideasPath = join(root, APPLICATION_MEMORY_DIR, IDEAS_INDEX_FILENAME);

        const registry = new BaseRegistry();
        const [descriptor] = registry.rediscover([root]);
        expect(descriptor).toBeDefined();
        const files = [join(root, 'demo.rq')];
        expect(await registry.ensureBaseReady(descriptor.id, files)).toBe(true);
        expect(registry.get(descriptor.id)?.index.isReady).toBe(true);

        await registry.releaseArtifacts();
        expect(registry.size).toBe(1);
        expect(registry.get(descriptor.id)?.index.state).toBe('uninitialized');
        await expectUnlinkable(ideasPath);

        // Descriptor remains; a later event can reopen (recreates the db file).
        expect(await registry.ensureBaseReady(descriptor.id, files)).toBe(true);
        expect(registry.get(descriptor.id)?.index.isReady).toBe(true);
        await access(ideasPath);

        await registry.deactivateAll();
        await rm(root, { recursive: true, force: true });
    });
});

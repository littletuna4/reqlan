/**
 * Bases refresh: marker paths + prune — no tree walk required for the pass itself.
 * rq:["../../../reqlan rq/bases/base.rq".refresh_bases_pass]
 * rq:["../../../reqlan rq/bases/base.rq".create_base_onboarding]
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, test } from 'vitest';
import { BaseRegistry } from '../src/index-store/base-registry.js';
import { createBase } from '../src/core/create-base.js';
import { APPLICATION_MEMORY_DIR } from '../src/core/application-memory.js';
import { nativeEngineAvailable, resetNativeEngineCache } from '../src/index.js';

const temps: string[] = [];

async function tempRoot(): Promise<string> {
    const root = join(tmpdir(), `reqlan-refresh-${randomUUID()}`);
    await mkdir(root, { recursive: true });
    temps.push(root);
    return root;
}

async function markBase(dir: string): Promise<string> {
    const marker = join(dir, APPLICATION_MEMORY_DIR);
    await mkdir(marker, { recursive: true });
    return marker;
}

afterEach(async () => {
    resetNativeEngineCache();
    for (const dir of temps.splice(0)) {
        await rm(dir, { recursive: true, force: true });
    }
});

describe('BaseRegistry.refreshBases', () => {
    test('refreshBases registers markers and prunes missing', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempRoot();
        await writeFile(join(root, 'demo.rq'), 'alpha this is alpha\n', 'utf8');
        const marker = await markBase(root);

        const registry = new BaseRegistry();
        const first = await registry.refreshBases([marker], {
            allRqFiles: [join(root, 'demo.rq')],
            syncActive: true
        });
        expect(first.bases).toHaveLength(1);
        expect(first.activeId).toBe(first.bases[0]!.id);
        expect(first.synced).toBe(true);

        await rm(marker, { recursive: true, force: true });
        const pruned = await registry.refreshBases([], { syncActive: false });
        expect(pruned.bases).toEqual([]);
        expect(pruned.activeId).toBeUndefined();
        expect(registry.size).toBe(0);

        await registry.deactivateAll();
    });

    test('refreshBases rediscovers a nested base from marker paths', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempRoot();
        const rootMarker = await markBase(root);
        await writeFile(join(root, 'root.rq'), 'root_idea this is root\n', 'utf8');

        const registry = new BaseRegistry();
        const first = await registry.refreshBases([rootMarker], {
            allRqFiles: [join(root, 'root.rq')],
            syncActive: true
        });
        expect(first.bases).toHaveLength(1);

        const child = join(root, 'pkg');
        await mkdir(child, { recursive: true });
        const childMarker = await markBase(child);
        await writeFile(join(child, 'child.rq'), 'child_idea this is child\n', 'utf8');

        const second = await registry.refreshBases([rootMarker, childMarker], {
            preferredActiveId: first.activeId,
            allRqFiles: [join(root, 'root.rq'), join(child, 'child.rq')],
            syncActive: true
        });
        expect(second.bases).toHaveLength(2);
        expect(second.bases.map(b => b.root).sort()).toEqual([child, root].sort());
        expect(second.activeId).toBe(first.activeId);
        expect(registry.size).toBe(2);

        await registry.deactivateAll();
    });

    test('refreshBases after createBase registers the new base', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempRoot();
        await writeFile(join(root, 'demo.rq'), 'alpha this is alpha\n', 'utf8');

        const registry = new BaseRegistry();
        expect((await registry.refreshBases([])).bases).toEqual([]);

        const created = await createBase(root);
        expect(created.created).toBe(true);
        expect(created.base.root).toBe(root);

        const refreshed = await registry.refreshBases([created.base.memoryPath], {
            preferredActiveId: created.base.id,
            allRqFiles: [join(root, 'demo.rq')],
            syncActive: true
        });
        expect(refreshed.bases).toHaveLength(1);
        expect(refreshed.bases[0]!.id).toBe(created.base.id);
        expect(refreshed.activeId).toBe(created.base.id);
        expect(refreshed.synced).toBe(true);
        expect(registry.list()[0]?.root).toBe(root);

        await registry.deactivateAll();
    });
});

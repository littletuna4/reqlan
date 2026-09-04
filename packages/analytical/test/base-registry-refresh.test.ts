/**
 * Refresh always rediscovers bases via BaseRegistry.refresh.
 * rq:["../../../reqlan rq/bases/base.rq".refresh_rediscovers_bases]
 * rq:["../../../reqlan rq/bases/base.rq".create_base_onboarding]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_manual]
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

async function markBase(dir: string): Promise<void> {
    await mkdir(join(dir, APPLICATION_MEMORY_DIR), { recursive: true });
}

afterEach(async () => {
    resetNativeEngineCache();
    for (const dir of temps.splice(0)) {
        await rm(dir, { recursive: true, force: true });
    }
});

describe('BaseRegistry.refresh', () => {
    test('refresh rediscovers a base created after an empty discovery', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempRoot();
        await writeFile(join(root, 'demo.rq'), 'alpha this is alpha\n', 'utf8');

        const registry = new BaseRegistry();
        const empty = await registry.refresh([root], {
            allRqFiles: [join(root, 'demo.rq')],
            syncActive: true
        });
        expect(empty.bases).toEqual([]);
        expect(empty.activeId).toBeUndefined();
        expect(empty.synced).toBe(false);
        expect(registry.size).toBe(0);

        await markBase(root);

        const refreshed = await registry.refresh([root], {
            allRqFiles: [join(root, 'demo.rq')],
            syncActive: true
        });
        expect(refreshed.bases).toHaveLength(1);
        expect(refreshed.bases[0]!.root).toBe(root);
        expect(refreshed.activeId).toBe(refreshed.bases[0]!.id);
        expect(refreshed.synced).toBe(true);
        expect(registry.get(refreshed.activeId!)?.index.isReady).toBe(true);

        await registry.deactivateAll();
    });

    test('refresh rediscovers a nested base added after first discovery', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempRoot();
        await markBase(root);
        await writeFile(join(root, 'root.rq'), 'root_idea this is root\n', 'utf8');

        const registry = new BaseRegistry();
        const first = await registry.refresh([root], {
            allRqFiles: [join(root, 'root.rq')],
            syncActive: true
        });
        expect(first.bases).toHaveLength(1);

        const child = join(root, 'pkg');
        await mkdir(child, { recursive: true });
        await markBase(child);
        await writeFile(join(child, 'child.rq'), 'child_idea this is child\n', 'utf8');

        const second = await registry.refresh([root], {
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

    test('refresh after createBase registers the new base', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempRoot();
        await writeFile(join(root, 'demo.rq'), 'alpha this is alpha\n', 'utf8');

        const registry = new BaseRegistry();
        expect((await registry.refresh([root])).bases).toEqual([]);

        const created = await createBase(root);
        expect(created.created).toBe(true);
        expect(created.base.root).toBe(root);

        const refreshed = await registry.refresh([root], {
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

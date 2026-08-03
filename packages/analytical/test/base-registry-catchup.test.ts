import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { BaseRegistry } from '../src/index-store/base-registry.js';
import { APPLICATION_MEMORY_DIR } from '../src/core/application-memory.js';

async function writeBase(root: string, files: Record<string, string>): Promise<void> {
    await mkdir(join(root, APPLICATION_MEMORY_DIR), { recursive: true });
    for (const [relativePath, contents] of Object.entries(files)) {
        const fullPath = join(root, relativePath);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, contents, 'utf8');
    }
}

describe('BaseRegistry catch-up', () => {
    test('ensureBaseReady opens and soft-syncs an uninitialized base', async () => {
        const root = join(tmpdir(), `reqlan-ready-${randomUUID()}`);
        await writeBase(root, {
            'demo.rq': 'alpha this is alpha\nbeta this is beta\n'
        });

        const registry = new BaseRegistry();
        const [descriptor] = registry.rediscover([root]);
        expect(descriptor).toBeDefined();
        const entry = registry.get(descriptor.id)!;
        expect(entry.index.state).toBe('uninitialized');

        const ok = await registry.ensureBaseReady(descriptor.id, [join(root, 'demo.rq')]);
        expect(ok).toBe(true);
        expect(entry.index.isReady).toBe(true);
        expect((await entry.index.indexStore.counts()).ideas).toBe(2);

        await registry.deactivateAll();
    });

    test('ensureBaseReady is a no-op when already ready', async () => {
        const root = join(tmpdir(), `reqlan-noop-${randomUUID()}`);
        await writeBase(root, { 'demo.rq': 'alpha this is alpha\n' });

        const registry = new BaseRegistry();
        const [descriptor] = registry.rediscover([root]);
        const files = [join(root, 'demo.rq')];
        expect(await registry.ensureBaseReady(descriptor.id, files)).toBe(true);

        const entry = registry.get(descriptor.id)!;
        const updates = entry.store.getState().documentUpdates.length;
        expect(await registry.ensureBaseReady(descriptor.id, files)).toBe(true);
        expect(entry.store.getState().documentUpdates.length).toBe(updates);

        await registry.deactivateAll();
    });

    test('checkStaleAll heals an uninitialized base', async () => {
        const root = join(tmpdir(), `reqlan-idle-${randomUUID()}`);
        await writeBase(root, { 'demo.rq': 'alpha this is alpha\n' });

        const registry = new BaseRegistry();
        const [descriptor] = registry.rediscover([root]);
        expect(registry.get(descriptor.id)!.index.state).toBe('uninitialized');

        const result = await registry.checkStaleAll([join(root, 'demo.rq')]);
        expect(registry.get(descriptor.id)!.index.isReady).toBe(true);
        expect(result.checked).toBeGreaterThan(0);

        await registry.deactivateAll();
    });

    test('deactivate returns to uninitialized so a base can be reopened', async () => {
        const root = join(tmpdir(), `reqlan-reopen-${randomUUID()}`);
        await writeBase(root, { 'demo.rq': 'alpha this is alpha\n' });

        const registry = new BaseRegistry();
        const [descriptor] = registry.rediscover([root]);
        const entry = registry.get(descriptor.id)!;
        await entry.index.open();
        expect(entry.index.state).toBe('idle');

        await entry.index.deactivate();
        expect(entry.index.state).toBe('uninitialized');

        const ok = await registry.ensureBaseReady(descriptor.id, [join(root, 'demo.rq')]);
        expect(ok).toBe(true);
        expect(entry.index.isReady).toBe(true);

        await registry.deactivateAll();
    });
});

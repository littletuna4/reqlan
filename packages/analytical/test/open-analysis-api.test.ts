/**
 * Native-only AnalysisApi factory.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
    nativeEngineAvailable,
    nativeEngineRequested,
    openAnalysisApi,
    resetNativeEngineCache
} from '../src/index.js';

async function tempBase(): Promise<string> {
    const root = join(tmpdir(), `reqlan-open-api-${randomUUID()}`);
    await mkdir(join(root, '.reqlan'), { recursive: true });
    await writeFile(join(root, 'demo.rq'), 'demo this is a demo idea\n', 'utf8');
    return root;
}

describe('openAnalysisApi', () => {
    afterEach(() => {
        delete process.env.REQLAN_ANALYTICAL_ENGINE;
        delete process.env.REQLAN_NATIVE;
        resetNativeEngineCache();
    });

    it('rejects the removed JS/sql.js engine override', () => {
        process.env.REQLAN_ANALYTICAL_ENGINE = 'js';
        expect(() => nativeEngineRequested()).toThrow(/no longer supported/i);
    });

    it('opens the native engine when the host .node is available', async () => {
        resetNativeEngineCache();
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempBase();
        const opened = await openAnalysisApi({ workspaceRoot: root });
        expect(opened.engine).toBe('native');
        const ideas = await opened.api.listRequirements(8);
        expect(ideas.some(idea => idea.name === 'demo')).toBe(true);
        await opened.dispose();
    });

    it('throws when the native engine is missing', async () => {
        resetNativeEngineCache();
        if (nativeEngineAvailable()) {
            return;
        }
        const root = await tempBase();
        await expect(openAnalysisApi({ workspaceRoot: root })).rejects.toThrow(/native engine was not found|host \.node was not found/i);
    });
});

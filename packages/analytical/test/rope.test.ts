/**
 * rq:["../../../reqlan rq/core_analysis/rope.rq".rope]
 * rq:["../../../reqlan rq/core_analysis/rope.rq".rope-idea-cardinality]
 * rq:["../../../reqlan rq/core_analysis/rope.rq".rope-tuning]
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
    nativeEngineAvailable,
    openAnalysisApi,
    resetNativeEngineCache
} from '../src/index.js';

async function tempBase(): Promise<string> {
    const root = join(tmpdir(), `reqlan-rope-api-${randomUUID()}`);
    await mkdir(join(root, '.reqlan'), { recursive: true });
    await writeFile(
        join(root, 'graph.rq'),
        `alpha {\n    root\n    see [beta]\n}\n\nbeta {\n    neighbour\n}\n`,
        'utf8'
    );
    return root;
}

describe('rope AnalysisApi', () => {
    afterEach(() => {
        resetNativeEngineCache();
    });

    it('rope API returns kind rope with cardinality candidates', async () => {
        resetNativeEngineCache();
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempBase();
        const opened = await openAnalysisApi({ workspaceRoot: root });
        const first = await opened.api.rope('alpha');
        expect(first.sessionKey.length).toBeGreaterThan(0);
        expect(first.kind).toBe('rope');
        expect(first.target?.name).toBe('alpha');
        expect(first.candidates?.some(candidate => candidate.name === 'beta')).toBe(true);
        const revisit = await opened.api.rope('alpha', {
            sessionKey: first.sessionKey
        });
        expect(revisit.sessionKey).toBe(first.sessionKey);
        expect(revisit.candidates?.some(candidate => candidate.name === 'beta')).toBe(false);
        await opened.dispose();
    });
});

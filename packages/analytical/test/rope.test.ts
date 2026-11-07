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
        const beta = first.candidates?.find(candidate => candidate.name === 'beta');
        expect(beta?.summary).toBeTruthy();
        const revisit = await opened.api.rope('alpha', {
            sessionKey: first.sessionKey
        });
        expect(revisit.sessionKey).toBe(first.sessionKey);
        expect(revisit.candidates?.some(candidate => candidate.name === 'beta')).toBe(false);
        await opened.dispose();
    });

    it('formatClickResult draws the graph chain', async () => {
        resetNativeEngineCache();
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempBase();
        const opened = await openAnalysisApi({ workspaceRoot: root });
        const first = await opened.api.rope('alpha');
        const graph = opened.api.formatClickResult(first, { graph: true });
        expect(graph).toContain('alpha');
        expect(graph).toContain('└─ beta');
        expect(graph).toContain('hops=1');
        expect(graph).not.toContain('\x1b[');
        const coloured = opened.api.formatClickResult(first, { graph: true, colour: true });
        expect(coloured).toContain('└─ \x1b[36mbeta\x1b[0m');
        expect(coloured).toContain('\x1b[1malpha\x1b[0m');
        await opened.dispose();
    });

    it('formatClickResult colours the rope chain', async () => {
        resetNativeEngineCache();
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempBase();
        const opened = await openAnalysisApi({ workspaceRoot: root });
        const first = await opened.api.rope('alpha');
        const coloured = opened.api.formatClickResult(first, { colour: true });
        expect(coloured).toContain('chain:');
        expect(coloured).toContain('\x1b[1malpha\x1b[0m');
        expect(coloured).toContain('\x1b[36mbeta\x1b[0m');
        expect(coloured).toContain('\x1b[2m');
        const plain = opened.api.formatClickResult(first);
        expect(plain).toContain('chain:');
        expect(plain).not.toContain('\x1b[');
        await opened.dispose();
    });
});

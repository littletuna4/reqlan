/**
 * rq:["../../../reqlan rq/cli/click.rq".click]
 * rq:["../../../reqlan rq/cli/click.rq".click_session]
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
    const root = join(tmpdir(), `reqlan-click-api-${randomUUID()}`);
    await mkdir(join(root, '.reqlan'), { recursive: true });
    await writeFile(
        join(root, 'graph.rq'),
        `alpha {\n    root\n    see [beta]\n}\n\nbeta {\n    neighbour\n}\n`,
        'utf8'
    );
    return root;
}

describe('click AnalysisApi', () => {
    afterEach(() => {
        resetNativeEngineCache();
    });

    it('click API returns session key and unique then revisit', async () => {
        resetNativeEngineCache();
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = await tempBase();
        const opened = await openAnalysisApi({ workspaceRoot: root });
        const first = await opened.api.click('alpha');
        expect(first.sessionKey.length).toBeGreaterThan(0);
        expect(first.kind).toBe('unique');
        expect(first.target?.name).toBe('alpha');
        expect(first.outbound?.items.some(item => item.name === 'beta')).toBe(true);
        const second = await opened.api.click('alpha', {
            sessionKey: first.sessionKey
        });
        expect(second.sessionKey).toBe(first.sessionKey);
        expect(second.kind).toBe('revisit');
        expect(second.connected?.some(item => item.name === 'beta')).toBe(true);
        await opened.dispose();
    });
});

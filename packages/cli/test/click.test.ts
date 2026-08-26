/**
 * rq:["../../../reqlan rq/cli/click.rq".click]
 * rq:["../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { nativeEngineAvailable, resetNativeEngineCache } from '@reqlan/analytical';

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliBin = join(cliRoot, 'bin/cli.js');

function runClick(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [cliBin, 'click', ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, REQLAN_WORKSPACE: cwd }
    });
    return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? ''
    };
}

describe('click command', () => {
    test('click command emits session and neighbours', () => {
        resetNativeEngineCache();
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = mkdtempSync(join(tmpdir(), 'reqlan-click-cli-'));
        mkdirSync(join(root, '.reqlan'), { recursive: true });
        writeFileSync(
            join(root, 'graph.rq'),
            `alpha {\n    root\n    see [beta]\n}\n\nbeta {\n    neighbour\n}\n`,
            'utf8'
        );
        const first = runClick(root, ['alpha', '--json']);
        expect(first.status).toBe(0);
        const payload = JSON.parse(first.stdout) as {
            sessionKey: string;
            nodes: Array<{ name: string }>;
        };
        expect(payload.sessionKey.length).toBeGreaterThan(0);
        expect(payload.nodes.some(idea => idea.name === 'beta')).toBe(true);
        const second = runClick(root, ['alpha', '--session', payload.sessionKey, '--json']);
        expect(second.status).toBe(0);
        const again = JSON.parse(second.stdout) as {
            sessionKey: string;
            nodes: Array<{ name: string }>;
            suppressedCount: number;
        };
        expect(again.sessionKey).toBe(payload.sessionKey);
        expect(again.nodes.some(idea => idea.name === 'beta')).toBe(false);
        expect(again.suppressedCount).toBeGreaterThan(0);
    });
});

/**
 * rq:["../../../reqlan rq/core_analysis/rope.rq".rope]
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

function runRope(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [cliBin, 'rope', ...args], {
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

describe('rope command', () => {
    test('rope command emits kind rope with frayed candidates', () => {
        resetNativeEngineCache();
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = mkdtempSync(join(tmpdir(), 'reqlan-rope-cli-'));
        mkdirSync(join(root, '.reqlan'), { recursive: true });
        writeFileSync(
            join(root, 'graph.rq'),
            `alpha {\n    root\n    see [beta]\n}\n\nbeta {\n    neighbour\n}\n`,
            'utf8'
        );
        const first = runRope(root, ['alpha', '--fray', '1', '--json']);
        expect(first.status).toBe(0);
        const payload = JSON.parse(first.stdout) as {
            sessionKey: string;
            kind: string;
            candidates?: Array<{ name: string }>;
        };
        expect(payload.sessionKey.length).toBeGreaterThan(0);
        expect(payload.kind).toBe('rope');
        expect(payload.candidates?.some(candidate => candidate.name === 'beta')).toBe(true);
        const revisit = runRope(root, ['alpha', '--session', payload.sessionKey, '--json']);
        expect(revisit.status).toBe(0);
        const again = JSON.parse(revisit.stdout) as {
            sessionKey: string;
            kind: string;
            candidates?: Array<{ name: string }>;
        };
        expect(again.sessionKey).toBe(payload.sessionKey);
        expect(again.kind).toBe('rope');
        expect(again.candidates?.some(candidate => candidate.name === 'beta')).toBe(false);
    });

    test('rope rejects an unknown --tuning value', () => {
        resetNativeEngineCache();
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = mkdtempSync(join(tmpdir(), 'reqlan-rope-cli-'));
        mkdirSync(join(root, '.reqlan'), { recursive: true });
        writeFileSync(join(root, 'graph.rq'), `alpha {\n    root\n}\n`, 'utf8');
        const failed = runRope(root, ['alpha', '--tuning', 'turbo', '--json']);
        expect(failed.status).toBe(1);
        expect(failed.stderr).toContain('--tuning');
    });
});

/**
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const cliBin = join(here, '../bin/cli.js');

function runAnalyse(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [cliBin, 'analyse', ...args], {
        encoding: 'utf8',
        cwd,
        env: { ...process.env, REQLAN_WORKSPACE: cwd }
    });
    return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? ''
    };
}

describe('CLI local symbolic analysis', () => {
    test('prints same-file inbound backlinks for --local-symbolic', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-local-symbolic-'));
        const file = join(root, 'host.rq');
        writeFileSync(
            file,
            `
host {
    See [local_idea].
}
local_idea {
    body
}
`
        );
        const result = runAnalyse(root, ['--local-symbolic', file]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Local symbolic analysis');
        expect(result.stdout).toContain('### local_idea');
        expect(result.stdout).toMatch(/Inbound \/ backlinks \(1\)/);
        expect(result.stdout).toContain('← host');
        expect(result.stdout).toContain('### host');
        expect(result.stdout).toMatch(/Outbound \(1\)/);
    });

    test('emits inbound on the JSON document', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-local-symbolic-json-'));
        const file = join(root, 'host.rq');
        writeFileSync(
            file,
            `
a { [b] }
b { body }
`
        );
        const result = runAnalyse(root, ['--local-symbolic', file, '--json']);
        expect(result.status).toBe(0);
        const doc = JSON.parse(result.stdout) as {
            inbound: Array<{ sourceId: string; targetId?: string }>;
        };
        expect(
            doc.inbound.some(edge => edge.targetId?.endsWith('#b') && edge.sourceId.endsWith('#a'))
        ).toBe(true);
    });
});

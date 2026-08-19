/**
 * rq:["../../../reqlan rq/core_analysis/core.rq".test_references]
 * rq:["../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

describe('CLI broken references', () => {
    test('lists broken idea refs and optional comment refs with a path glob', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-broken-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            mkdirSync(join(root, 'reqs'));
            mkdirSync(join(root, 'src'));
            writeFileSync(join(root, 'reqs', 'host.rq'), 'host {\n    [missing_idea]\n}\n');
            writeFileSync(join(root, 'src', 'app.ts'), '// rq:[gone]\n');

            const ideaOnly = runAnalyse(root, ['--broken-refs', '--json']);
            expect(ideaOnly.status, ideaOnly.stderr).toBe(0);
            const ideaRows = JSON.parse(ideaOnly.stdout) as Array<{ label: string; kind: string }>;
            expect(ideaRows.some(row => row.label === 'missing_idea')).toBe(true);
            expect(ideaRows.every(row => row.kind !== 'comment_link')).toBe(true);

            const scoped = runAnalyse(root, ['--broken-refs', '--glob', 'reqs/**', '--json']);
            expect(scoped.status, scoped.stderr).toBe(0);
            const scopedRows = JSON.parse(scoped.stdout) as Array<{ label: string; fileUri: string }>;
            expect(scopedRows).toHaveLength(1);
            expect(scopedRows[0]?.label).toBe('missing_idea');

            const comments = runAnalyse(root, [
                '--broken-refs',
                '--glob',
                'src/**',
                '--include-comments',
                '--json'
            ]);
            expect(comments.status, comments.stderr).toBe(0);
            const commentRows = JSON.parse(comments.stdout) as Array<{ label: string; kind: string }>;
            expect(commentRows).toEqual(
                expect.arrayContaining([expect.objectContaining({ kind: 'comment_link', label: 'gone' })])
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

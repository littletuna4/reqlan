/**
 * rq:["../../../reqlan rq/core_analysis/check.rq".check]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
 * rq:["../../../reqlan rq/cli/cli_package.rq".commands]
 * rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const cliBin = join(here, '../bin/cli.js');

function runCheck(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [cliBin, 'check', ...args], {
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

describe('CLI check', () => {
    test('reports unresolved idea, comment, and file refs and exits 1', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            mkdirSync(join(root, 'src'));
            writeFileSync(join(root, 'src', 'app.ts'), 'export {}\n');
            writeFileSync(
                join(root, 'host.rq'),
                [
                    'host {',
                    '    [missing_idea]',
                    '    ["./src/app.ts"]',
                    '    ["./src/gone.ts"]',
                    '    //rq-ignore-error',
                    '    [ignored_missing]',
                    '}',
                    ''
                ].join('\n')
            );
            writeFileSync(join(root, 'src', 'note.ts'), '// rq:[gone_comment]\n');

            const json = runCheck(root, ['--json']);
            expect(json.status, json.stderr).toBe(1);
            const rows = JSON.parse(json.stdout) as Array<{ label: string; kind: string }>;
            expect(rows.some(row => row.label === 'missing_idea')).toBe(true);
            expect(rows.some(row => row.kind === 'comment_link' && row.label === 'gone_comment')).toBe(true);
            expect(rows.some(row => row.kind === 'file_reference' && row.label === './src/gone.ts')).toBe(true);
            expect(rows.every(row => row.label !== 'ignored_missing')).toBe(true);
            expect(rows.every(row => row.label !== './src/app.ts')).toBe(true);

            const pipe = runCheck(root, ['--pipe']);
            expect(pipe.status, pipe.stderr).toBe(1);
            expect(pipe.stdout).toContain('[references] missing_idea');
            expect(pipe.stdout).toContain('[comment_link] gone_comment');
            expect(pipe.stdout).toContain('[file_reference] ./src/gone.ts');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('quotes source paths that contain spaces', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-space-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            mkdirSync(join(root, 'reqlan rq'));
            writeFileSync(join(root, 'reqlan rq', 'host.rq'), 'host {\n    [missing_idea]\n}\n');

            const pipe = runCheck(root, ['--pipe']);
            expect(pipe.status, pipe.stderr).toBe(1);
            expect(pipe.stdout).toContain('"reqlan rq/host.rq":');
            expect(pipe.stdout).toContain('[references] missing_idea');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('exits 0 when there are no issues', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-ok-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            writeFileSync(join(root, 'host.rq'), 'host {\n    local\n}\n');
            const result = runCheck(root, ['--json']);
            expect(result.status, result.stderr).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('orders json rows by missing target', { timeout: 30_000 }, () => {
        // rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-order-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            mkdirSync(join(root, 'a'));
            mkdirSync(join(root, 'b'));
            writeFileSync(join(root, 'a', 'one.rq'), 'one {\n    [shared_missing]\n    [zebra_missing]\n}\n');
            writeFileSync(join(root, 'b', 'two.rq'), 'two {\n    [shared_missing]\n    [alpha_missing]\n}\n');

            const json = runCheck(root, ['--json']);
            expect(json.status, json.stderr).toBe(1);
            const rows = JSON.parse(json.stdout) as Array<{ label: string; fileUri: string }>;
            expect(rows.map(row => row.label)).toEqual([
                'alpha_missing',
                'shared_missing',
                'shared_missing',
                'zebra_missing'
            ]);
            expect(
                rows.filter(row => row.label === 'shared_missing').map(row => row.fileUri)
            ).toEqual(['a/one.rq', 'b/two.rq']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('warns on wildcards with 0 or 1 match', { timeout: 30_000 }, () => {
        // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-wild-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            mkdirSync(join(root, 'mods'));
            writeFileSync(join(root, 'mods', 'alpha.rq'), 'widget_a {\n    a\n}\n');
            writeFileSync(join(root, 'mods', 'beta.rq'), 'widget_b {\n    b\n}\n');
            writeFileSync(
                join(root, 'host.rq'),
                'host {\n    ["./mods/*.rq".missing_*]\n    ["./mods/*.rq".widget_a*]\n    ["./mods/*.rq".widget_*]\n}\n'
            );

            const json = runCheck(root, ['--json']);
            expect(json.status, json.stderr).toBe(1);
            const rows = JSON.parse(json.stdout) as Array<{
                kind: string;
                label: string;
                severity: string;
                matchCount?: number;
            }>;
            const wild = rows.filter(row => row.kind === 'wildcard_reference');
            expect(wild.some(row => row.severity === 'warning' && row.matchCount === 0)).toBe(true);
            expect(wild.some(row => row.severity === 'warning' && row.matchCount === 1)).toBe(true);
            expect(wild.every(row => row.matchCount !== 2)).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('honours wildcard-zero and wildcard-one handling flags', { timeout: 30_000 }, () => {
        // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
        // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-wild-flags-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            mkdirSync(join(root, 'mods'));
            writeFileSync(join(root, 'mods', 'alpha.rq'), 'widget_a {\n    a\n}\n');
            writeFileSync(join(root, 'mods', 'beta.rq'), 'widget_b {\n    b\n}\n');
            writeFileSync(
                join(root, 'host.rq'),
                'host {\n    ["./mods/*.rq".missing_*]\n    ["./mods/*.rq".widget_a*]\n    ["./mods/*.rq".widget_*]\n}\n'
            );

            const offZero = runCheck(root, ['--json', '--wildcard-zero', 'off']);
            expect(offZero.status, offZero.stderr).toBe(1);
            const offZeroRows = JSON.parse(offZero.stdout) as Array<{ matchCount?: number; severity: string }>;
            expect(offZeroRows.every(row => row.matchCount !== 0)).toBe(true);
            expect(offZeroRows.some(row => row.matchCount === 1 && row.severity === 'warning')).toBe(true);

            const errorOne = runCheck(root, ['--json', '--wildcard-one', 'error']);
            expect(errorOne.status, errorOne.stderr).toBe(1);
            const errorOneRows = JSON.parse(errorOne.stdout) as Array<{ matchCount?: number; severity: string }>;
            expect(errorOneRows.some(row => row.matchCount === 1 && row.severity === 'error')).toBe(true);
            expect(errorOneRows.some(row => row.matchCount === 0 && row.severity === 'warning')).toBe(true);

            const bothOff = runCheck(root, ['--json', '--wildcard-zero', 'off', '--wildcard-one', 'off']);
            expect(bothOff.status, bothOff.stderr).toBe(0);
            expect(JSON.parse(bothOff.stdout)).toEqual([]);

            const bad = runCheck(root, ['--wildcard-zero', 'nope']);
            expect(bad.status, bad.stderr).toBe(1);
            expect(bad.stderr).toContain('--wildcard-zero must be warn, error, or off');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('honours skip-target globs', { timeout: 30_000 }, () => {
        // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-skip-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            writeFileSync(
                join(root, 'host.rq'),
                [
                    'host {',
                    '    [missing_idea]',
                    '    ["../../../.cursor/mcp.json"]',
                    '    ["../../../.cursor/skills"]',
                    '}',
                    ''
                ].join('\n')
            );

            const skipped = runCheck(root, ['--json', '--skip-target', '**/.cursor/**']);
            expect(skipped.status, skipped.stderr).toBe(1);
            const skippedRows = JSON.parse(skipped.stdout) as Array<{ label: string }>;
            expect(skippedRows.some(row => row.label === 'missing_idea')).toBe(true);
            expect(skippedRows.every(row => !row.label.includes('.cursor'))).toBe(true);

            const allSkipped = runCheck(root, [
                '--json',
                '--skip-target',
                '**/.cursor/**',
                '--skip-target',
                'missing_idea'
            ]);
            expect(allSkipped.status, allSkipped.stderr).toBe(0);
            expect(JSON.parse(allSkipped.stdout)).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('accepts skip-target after a pnpm end-of-options marker', { timeout: 30_000 }, () => {
        // rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-pnpm-dash-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            writeFileSync(
                join(root, 'host.rq'),
                [
                    'host {',
                    '    [missing_idea]',
                    '    ["../../../.cursor/mcp.json"]',
                    '}',
                    ''
                ].join('\n')
            );

            const skipped = runCheck(root, ['--', '--json', '--skip-target', '**/.cursor/**']);
            expect(skipped.status, skipped.stderr).toBe(1);
            expect(skipped.stderr).not.toMatch(/Unknown Syntax Error/i);
            const skippedRows = JSON.parse(skipped.stdout) as Array<{ label: string }>;
            expect(skippedRows.some(row => row.label === 'missing_idea')).toBe(true);
            expect(skippedRows.every(row => !row.label.includes('.cursor'))).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('honours skip-gitignored-targets', { timeout: 30_000 }, () => {
        // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-check-gitignore-'));
        try {
            mkdirSync(join(root, '.reqlan'));
            mkdirSync(join(root, '.git'));
            writeFileSync(join(root, '.gitignore'), '.cursor/\nbuild/\n');
            writeFileSync(
                join(root, 'host.rq'),
                [
                    'host {',
                    '    [missing_idea]',
                    '    ["./.cursor/mcp.json"]',
                    '    ["./build/out.js"]',
                    '}',
                    ''
                ].join('\n')
            );

            const all = runCheck(root, ['--json']);
            expect(all.status, all.stderr).toBe(1);
            const allRows = JSON.parse(all.stdout) as Array<{ label: string }>;
            expect(allRows.some(row => row.label === 'missing_idea')).toBe(true);
            expect(allRows.some(row => row.label.includes('.cursor'))).toBe(true);
            expect(allRows.some(row => row.label.includes('build/out.js'))).toBe(true);

            const skipped = runCheck(root, ['--json', '--skip-gitignored-targets']);
            expect(skipped.status, skipped.stderr).toBe(1);
            const skippedRows = JSON.parse(skipped.stdout) as Array<{ label: string }>;
            expect(skippedRows.some(row => row.label === 'missing_idea')).toBe(true);
            expect(skippedRows.every(row => !row.label.includes('.cursor'))).toBe(true);
            expect(skippedRows.every(row => !row.label.includes('build/'))).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

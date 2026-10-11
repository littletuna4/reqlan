/**
 * rq:["../../../reqlan rq/cli/diff.rq".diff]
 * rq:["../../../reqlan rq/cli/diff.rq".diff_verbosity]
 * rq:["../../../reqlan rq/cli/diff.rq".diff_cli_color]
 * rq:["../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const cliBin = join(here, '../bin/cli.js');

function git(dir: string, args: string[]): string {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
    git(dir, ['init', '-b', 'main']);
    git(dir, ['config', 'user.email', 'diff@example.com']);
    git(dir, ['config', 'user.name', 'Diff Test']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
}

function commitAll(dir: string, message: string): string {
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', message]);
    return git(dir, ['rev-parse', 'HEAD']);
}

function runDiff(
    cwd: string,
    args: string[],
    env: NodeJS.ProcessEnv = process.env
): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [cliBin, 'diff', ...args], {
        encoding: 'utf8',
        cwd,
        env: { ...env, REQLAN_WORKSPACE: cwd }
    });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function bodyLines(stdout: string): string {
    return stdout.replace(/^Comparing .+\n\n/, '');
}

describe('CLI diff', () => {
    test('lists a created idea and omits the unchanged idea', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-created-'));
        try {
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n');
            const left = commitAll(root, 'a');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n\nbeta {\n    two\n}\n');
            const right = commitAll(root, 'b');
            const result = runDiff(root, [left, right]);
            expect(result.status, result.stderr).toBe(0);
            expect(result.stdout).toContain('created');
            expect(result.stdout).toContain('beta');
            expect(result.stdout).not.toMatch(/^created\s+alpha/m);
            expect(result.stdout).not.toContain('\u001b');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('one argument matches an explicit HEAD on the right', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-one-'));
        try {
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n');
            commitAll(root, 'a');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n\nbeta {\n    two\n}\n');
            commitAll(root, 'b');
            const implicit = runDiff(root, ['HEAD~1']);
            const explicit = runDiff(root, ['HEAD~1', 'HEAD']);
            expect(implicit.status, implicit.stderr).toBe(0);
            expect(implicit.stdout).toContain('Comparing HEAD~1 -> HEAD');
            expect(explicit.stdout).not.toContain('Comparing ');
            expect(bodyLines(implicit.stdout)).toBe(bodyLines(explicit.stdout));
            expect(implicit.stdout).toContain('created');
            expect(implicit.stdout).toContain('beta');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('tilde count matches HEAD~N', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-tilde-'));
        try {
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n');
            commitAll(root, 'a');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\nbeta {\n    mid\n}\n');
            commitAll(root, 'b');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\nbeta {\n    mid\n}\ngamma {\n    new\n}\n');
            commitAll(root, 'c');
            const relative = runDiff(root, ['~2']);
            const explicit = runDiff(root, ['HEAD~2', 'HEAD']);
            expect(relative.stdout).toContain('Comparing HEAD~2 -> HEAD');
            expect(bodyLines(relative.stdout)).toBe(bodyLines(explicit.stdout));
            expect(relative.stdout).toContain('beta');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('compares a branch with HEAD and with another branch', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-branch-'));
        try {
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n');
            commitAll(root, 'base');
            git(root, ['checkout', '-b', 'feature']);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n\nbeta {\n    two\n}\n');
            commitAll(root, 'feature');
            const againstHead = runDiff(root, ['main']);
            expect(againstHead.stdout).toContain('created');
            expect(againstHead.stdout).toContain('beta');
            const forward = runDiff(root, ['main', 'feature']);
            const backward = runDiff(root, ['feature', 'main']);
            expect(forward.stdout).toContain('created');
            expect(backward.stdout).toContain('deleted');
            expect(backward.stdout).toContain('beta');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('pending edits use the worktree, including a later unstaged layer', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-pending-'));
        try {
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n');
            commitAll(root, 'base');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n\nbeta {\n    two\n}\n');
            const unstaged = runDiff(root, []);
            expect(unstaged.stdout).toContain('Comparing HEAD -> pending');
            expect(unstaged.stdout).toContain('beta');
            git(root, ['add', 'reqs.rq']);
            const staged = runDiff(root, []);
            expect(staged.stdout).toContain('Comparing HEAD -> pending');
            expect(staged.stdout).toContain('beta');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n\ngamma {\n    three\n}\n');
            const layered = runDiff(root, []);
            expect(layered.stdout).toContain('Comparing HEAD -> pending');
            expect(layered.stdout).toContain('gamma');
            expect(layered.stdout).not.toContain('beta');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('a clean tree compares HEAD~1 with HEAD and ignores a non-rq edit', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-clean-'));
        try {
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n');
            commitAll(root, 'a');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n\nbeta {\n    two\n}\n');
            commitAll(root, 'b');
            const clean = runDiff(root, []);
            const explicit = runDiff(root, ['HEAD~1', 'HEAD']);
            expect(clean.stdout).toContain('Comparing HEAD~1 -> HEAD');
            expect(explicit.stdout).not.toContain('Comparing ');
            expect(bodyLines(clean.stdout)).toBe(bodyLines(explicit.stdout));
            expect(clean.stdout).toContain('beta');
            writeFileSync(join(root, 'notes.txt'), 'dirty\n');
            const dirtyOther = runDiff(root, []);
            expect(dirtyOther.stdout).toBe(clean.stdout);

            const rootOnly = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-root-'));
            try {
                initRepo(rootOnly);
                writeFileSync(join(rootOnly, 'reqs.rq'), 'alpha {\n    one\n}\n');
                commitAll(rootOnly, 'only');
                const created = runDiff(rootOnly, []);
                expect(created.stdout).toContain('Comparing HEAD~1 -> HEAD');
                expect(created.stdout).toContain('created');
                expect(created.stdout).toContain('alpha');
            } finally {
                rmSync(rootOnly, { recursive: true, force: true });
            }
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('a missing repository or revision exits 2', () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-err-'));
        try {
            const missing = runDiff(root, []);
            expect(missing.status).toBe(2);
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n');
            commitAll(root, 'a');
            const bad = runDiff(root, ['not-a-rev']);
            expect(bad.status).toBe(2);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('verbosity flags and JSON omit unused fields', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-verb-'));
        try {
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    see [beta]\n}\n');
            const left = commitAll(root, 'a');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    see [gamma]\n}\n');
            const right = commitAll(root, 'b');
            const summary = runDiff(root, [left, right, '--json']);
            const references = runDiff(root, [left, right, '-v']);
            const text = runDiff(root, [left, right, '-vv']);
            const jsonRefs = runDiff(root, [left, right, '--json', '--verbosity', 'references']);
            const jsonText = runDiff(root, [left, right, '--json', '--verbosity', 'text']);
            const bad = runDiff(root, [left, right, '--verbosity', 'bodies']);
            const summaryRows = JSON.parse(summary.stdout) as Array<Record<string, unknown>>;
            expect(summaryRows).toEqual([{ change: 'modified', name: 'alpha', file: 'reqs.rq' }]);
            expect(references.stdout).toContain('+ gamma');
            expect(references.stdout).toContain('- beta');
            expect(references.stdout).not.toContain('see');
            expect(text.stdout).toContain('- see [beta]');
            expect(text.stdout).toContain('+ see [gamma]');
            const refRows = JSON.parse(jsonRefs.stdout) as Array<{ references?: { added: string[]; removed: string[] }; text?: unknown }>;
            expect(refRows[0]?.references).toEqual({ added: ['gamma'], removed: ['beta'] });
            expect(refRows[0]?.text).toBeUndefined();
            const textRows = JSON.parse(jsonText.stdout) as Array<{
                references?: unknown;
                text?: { before: string; after: string };
            }>;
            expect(textRows[0]?.references).toBeUndefined();
            expect(textRows[0]?.text?.before).toContain('see [beta]');
            expect(textRows[0]?.text?.after).toContain('see [gamma]');
            expect(bad.status).toBe(2);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('color is opt-in when stdout is not a terminal', { timeout: 30_000 }, () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-cli-diff-color-'));
        try {
            initRepo(root);
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n');
            const left = commitAll(root, 'a');
            writeFileSync(join(root, 'reqs.rq'), 'alpha {\n    one\n}\n\nbeta {\n    two\n}\n');
            const right = commitAll(root, 'b');
            const plain = runDiff(root, [left, right]);
            const forcedOff = runDiff(root, [left, right, '--no-color']);
            const json = runDiff(root, [left, right, '--json']);
            const noColorEnv = runDiff(root, [left, right], { ...process.env, NO_COLOR: '1' });
            const forced = runDiff(root, [left, right, '--color'], { ...process.env, NO_COLOR: '1' });
            expect(plain.stdout).not.toContain('\u001b');
            expect(forcedOff.stdout).not.toContain('\u001b');
            expect(json.stdout).not.toContain('\u001b');
            expect(noColorEnv.stdout).not.toContain('\u001b');
            expect(forced.stdout).toContain('\u001b[32m');
            expect(forced.stdout).toContain('created');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

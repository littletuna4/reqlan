/**
 * Commit-time rustfmt hook: format staged crate sources; CI still --check.
 * rq:["../../../reqlan rq/development/commit.rq".rust_fmt]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, test } from 'vitest';
import { HOOKS_PATH, installGitHooks } from '../../../scripts/install-git-hooks.mjs';
import {
    gitStateFromDir,
    runRustFmtPreCommit,
    stagedRustSources,
    shouldSkipFmt
} from '../../../scripts/pre-commit-rust-fmt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))
    );
});

function fakeRun(calls: { command: string; args: string[]; cwd?: string }[]) {
    return (command: string, args: string[], options: { cwd?: string } = {}) => {
        calls.push({ command, args, cwd: options.cwd });
        return { status: 0, stdout: '', stderr: '', error: undefined };
    };
}

describe('rust fmt pre-commit hook', () => {
    // rq:["../../../reqlan rq/development/commit.rq".rust_fmt]
    test('selects only staged crate rust sources', () => {
        expect(
            stagedRustSources([
                'crates/reqlan-parse/src/lib.rs',
                'crates/reqlan-parse/src\\lexer.rs',
                'packages/cli/src/main.ts',
                'crates/rustfmt.toml',
                'README.md'
            ])
        ).toEqual(['crates/reqlan-parse/src/lib.rs', 'crates/reqlan-parse/src\\lexer.rs']);
    });

    // rq:["../../../reqlan rq/development/commit.rq".rust_fmt]
    test('skips formatting when no rust is staged, during merge, or when SKIP_RUST_FMT=1', () => {
        expect(shouldSkipFmt({ env: { SKIP_RUST_FMT: '1' } })).toBe('SKIP_RUST_FMT');
        expect(shouldSkipFmt({ gitState: { merge: true } })).toBe('merge-or-rebase');
        expect(shouldSkipFmt({ gitState: { rebase: true } })).toBe('merge-or-rebase');
        expect(shouldSkipFmt({ env: {}, gitState: {} })).toBeNull();

        const calls: { command: string; args: string[] }[] = [];
        const skipped = runRustFmtPreCommit({
            stagedPaths: ['packages/cli/src/main.ts'],
            gitState: {},
            run: fakeRun(calls),
            log: { error() {} }
        });
        expect(skipped).toMatchObject({ status: 0, skipped: 'no-rust' });
        expect(calls).toEqual([]);
    });

    // rq:["../../../reqlan rq/development/commit.rq".rust_fmt]
    test('runs cargo fmt --all in crates then restages the rust files', () => {
        const calls: { command: string; args: string[]; cwd?: string }[] = [];
        const files = ['crates/reqlan-parse/src/lib.rs', 'crates/reqlan-index/src/lib.rs'];
        const result = runRustFmtPreCommit({
            cwd: root,
            stagedPaths: [...files, 'README.md'],
            gitState: {},
            run: fakeRun(calls),
            log: { error() {}, info() {} }
        });
        expect(result).toMatchObject({ status: 0, skipped: null, files });
        expect(calls).toEqual([
            {
                command: 'cargo',
                args: ['fmt', '--all'],
                cwd: join(root, 'crates')
            },
            {
                command: 'git',
                args: ['add', '--', ...files],
                cwd: root
            }
        ]);
    });

    // rq:["../../../reqlan rq/development/commit.rq".rust_fmt]
    test('fails the commit when cargo fmt fails and does not git add', () => {
        const calls: { command: string; args: string[] }[] = [];
        const errors: string[] = [];
        const result = runRustFmtPreCommit({
            stagedPaths: ['crates/reqlan-parse/src/lib.rs'],
            gitState: {},
            run: (command, args) => {
                calls.push({ command, args });
                if (command === 'cargo') {
                    return { status: 1, stdout: '', stderr: 'rustfmt missing', error: undefined };
                }
                return { status: 0, stdout: '', stderr: '', error: undefined };
            },
            log: {
                error(message: unknown) {
                    errors.push(String(message));
                }
            }
        });
        expect(result.status).toBe(1);
        expect(calls.map(call => call.command)).toEqual(['cargo']);
        expect(errors.join('\n')).toMatch(/rustup component add rustfmt/);
        expect(errors.join('\n')).toMatch(/SKIP_RUST_FMT=1/);
    });

    // rq:["../../../reqlan rq/development/commit.rq".rust_fmt]
    test('detects in-progress merge and rebase from git dir files', async () => {
        const gitDir = await mkdtemp(join(tmpdir(), 'reqlan-git-state-'));
        temporaryDirectories.push(gitDir);
        expect(gitStateFromDir(gitDir)).toEqual({ merge: false, rebase: false });
        writeFileSync(join(gitDir, 'MERGE_HEAD'), '');
        expect(gitStateFromDir(gitDir).merge).toBe(true);
        mkdirSync(join(gitDir, 'rebase-merge'));
        expect(gitStateFromDir(gitDir).rebase).toBe(true);
    });

    // rq:["../../../reqlan rq/development/commit.rq".rust_fmt]
    test('CI still checks cargo fmt --all and prepare installs committed hooks', () => {
        const ci = readFileSync(join(root, '.github/workflows/ci-rust.yml'), 'utf8');
        expect(ci).toMatch(/cargo fmt --all -- --check/);
        expect(ci).toContain('rq:["../../reqlan rq/development/commit.rq".rust_fmt]');

        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        expect(pkg.scripts.prepare).toBe('node scripts/install-git-hooks.mjs');

        const hook = readFileSync(join(root, '.githooks/pre-commit'), 'utf8');
        expect(hook.startsWith('#!/bin/sh')).toBe(true);
        expect(hook).toContain('scripts/pre-commit-rust-fmt.mjs');
        expect(hook).toContain('rq:["../reqlan rq/development/commit.rq".rust_fmt]');
        expect(readFileSync(join(root, 'crates/rustfmt.toml'), 'utf8')).toContain(
            'rq:["../reqlan rq/development/commit.rq".rust_fmt]'
        );
        expect(readFileSync(join(root, 'scripts/pre-commit-rust-fmt.mjs'), 'utf8')).toContain(
            'rq:["../reqlan rq/development/commit.rq".rust_fmt]'
        );
        expect(readFileSync(join(root, 'scripts/install-git-hooks.mjs'), 'utf8')).toContain(
            'rq:["../reqlan rq/development/commit.rq".rust_fmt]'
        );
    });

    // rq:["../../../reqlan rq/development/commit.rq".rust_fmt]
    test('installGitHooks sets core.hooksPath in a git work tree', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'reqlan-hooks-'));
        temporaryDirectories.push(dir);
        mkdirSync(join(dir, HOOKS_PATH), { recursive: true });
        writeFileSync(join(dir, HOOKS_PATH, 'pre-commit'), '#!/bin/sh\n');
        const init = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
        expect(init.status, init.stderr).toBe(0);

        const result = installGitHooks({ cwd: dir });
        expect(result).toEqual({ installed: true });
        const hooksPath = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
            cwd: dir,
            encoding: 'utf8'
        });
        expect(hooksPath.stdout.trim()).toBe(HOOKS_PATH);
    });
});

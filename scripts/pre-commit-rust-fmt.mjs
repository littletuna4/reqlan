/**
 * Pre-commit: run cargo fmt on crate sources so commits stay formatted.
 * CI still enforces with `cargo fmt --all -- --check`.
 *
 * rq:["../reqlan rq/development/commit.rq".rust_fmt]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} repoPath
 * @returns {string}
 */
export function normalizeRepoPath(repoPath) {
    return repoPath.replaceAll('\\', '/');
}

/**
 * @param {string[]} paths
 * @returns {string[]}
 */
export function stagedRustSources(paths) {
    return paths.filter((repoPath) => {
        const normalized = normalizeRepoPath(repoPath);
        return normalized.startsWith('crates/') && normalized.endsWith('.rs');
    });
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, gitState?: { merge?: boolean, rebase?: boolean } }} [options]
 * @returns {string | null}
 */
export function shouldSkipFmt(options = {}) {
    const env = options.env ?? process.env;
    if (env.SKIP_RUST_FMT === '1') {
        return 'SKIP_RUST_FMT';
    }
    const gitState = options.gitState ?? {};
    if (gitState.merge || gitState.rebase) {
        return 'merge-or-rebase';
    }
    return null;
}

/**
 * @param {string} gitDir
 * @returns {{ merge: boolean, rebase: boolean }}
 */
export function gitStateFromDir(gitDir) {
    return {
        merge: fs.existsSync(path.join(gitDir, 'MERGE_HEAD')),
        rebase:
            fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
            fs.existsSync(path.join(gitDir, 'rebase-apply')),
    };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function defaultRun(command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        encoding: 'utf8',
        shell: process.platform === 'win32',
    });
}

/**
 * @param {{
 *   cwd?: string,
 *   env?: NodeJS.ProcessEnv,
 *   stagedPaths?: string[],
 *   gitState?: { merge?: boolean, rebase?: boolean },
 *   run?: typeof defaultRun,
 *   log?: { error: (...args: unknown[]) => void, info?: (...args: unknown[]) => void },
 * }} [options]
 */
export function runRustFmtPreCommit(options = {}) {
    const cwd = options.cwd ?? root;
    const env = options.env ?? process.env;
    const run = options.run ?? defaultRun;
    const log = options.log ?? console;

    const gitState = options.gitState ?? detectGitState(cwd, run);
    const skip = shouldSkipFmt({ env, gitState });
    if (skip) {
        return { status: 0, skipped: skip, files: [] };
    }

    const files = stagedRustSources(options.stagedPaths ?? listStaged(cwd, run, env));
    if (files.length === 0) {
        return { status: 0, skipped: 'no-rust', files: [] };
    }

    const fmt = run('cargo', ['fmt', '--all'], { cwd: path.join(cwd, 'crates'), env });
    if (fmt.error || fmt.status !== 0) {
        log.error(
            'cargo fmt failed. Install rustfmt (`rustup component add rustfmt`) or skip with SKIP_RUST_FMT=1. CI still checks format.'
        );
        if (fmt.stderr) {
            log.error(String(fmt.stderr).trimEnd());
        }
        return { status: fmt.status || 1, skipped: null, files };
    }

    const add = run('git', ['add', '--', ...files], { cwd, env });
    if (add.error || add.status !== 0) {
        log.error('git add of rustfmt output failed.');
        if (add.stderr) {
            log.error(String(add.stderr).trimEnd());
        }
        return { status: add.status || 1, skipped: null, files };
    }

    log.info?.(`rustfmt: formatted ${files.length} staged crate file(s)`);
    return { status: 0, skipped: null, files };
}

/**
 * @param {string} cwd
 * @param {typeof defaultRun} run
 */
function detectGitState(cwd, run) {
    const result = run('git', ['rev-parse', '--git-dir'], { cwd });
    if (result.status !== 0) {
        return { merge: false, rebase: false };
    }
    const gitDir = path.resolve(cwd, String(result.stdout ?? '').trim());
    return gitStateFromDir(gitDir);
}

/**
 * @param {string} cwd
 * @param {typeof defaultRun} run
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function listStaged(cwd, run, env) {
    const result = run(
        'git',
        ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
        { cwd, env }
    );
    if (result.error || result.status !== 0) {
        throw new Error(
            `git diff --cached failed: ${String(result.stderr ?? result.error ?? '').trim()}`
        );
    }
    return String(result.stdout ?? '')
        .split('\0')
        .filter(Boolean);
}

function invokedDirectly() {
    const entry = process.argv[1];
    if (!entry) {
        return false;
    }
    try {
        return import.meta.url === pathToFileURL(path.resolve(entry)).href;
    } catch {
        return false;
    }
}

if (invokedDirectly()) {
    try {
        const result = runRustFmtPreCommit();
        process.exit(result.status);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

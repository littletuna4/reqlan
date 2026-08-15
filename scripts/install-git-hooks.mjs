/**
 * Point this clone at committed hooks under `.githooks/` (pnpm prepare).
 * No-ops outside a git work tree so install still succeeds.
 *
 * rq:["../reqlan rq/development/commit.rq".rust_fmt]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOOKS_PATH = '.githooks';

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
 *   run?: typeof defaultRun,
 *   chmod?: (filePath: string, mode: number) => void,
 *   log?: { warn: (...args: unknown[]) => void },
 * }} [options]
 * @returns {{ installed: boolean, reason?: string }}
 */
export function installGitHooks(options = {}) {
    const cwd = options.cwd ?? root;
    const run = options.run ?? defaultRun;
    const chmod = options.chmod ?? fs.chmodSync;
    const log = options.log ?? console;

    const inside = run('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
    if (inside.error || inside.status !== 0 || String(inside.stdout ?? '').trim() !== 'true') {
        return { installed: false, reason: 'not-a-git-work-tree' };
    }

    const set = run('git', ['config', 'core.hooksPath', HOOKS_PATH], { cwd });
    if (set.error || set.status !== 0) {
        const detail = String(set.stderr ?? set.error?.message ?? '').trim();
        log.warn(
            `Could not set core.hooksPath; git hooks are not installed.${detail ? ` ${detail}` : ''}`
        );
        return { installed: false, reason: 'git-config-failed' };
    }

    const preCommit = path.join(cwd, HOOKS_PATH, 'pre-commit');
    if (process.platform !== 'win32' && fs.existsSync(preCommit)) {
        chmod(preCommit, 0o755);
    }

    return { installed: true };
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
    installGitHooks();
}

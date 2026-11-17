/**
 * Pure CLI version logic: parse, compare, and version spawns. No `vscode` import,
 * so tests can load this module directly.
 * rq:["../../../../reqlan rq/extension/host/cli-version-check.rq".cli_version_check]
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withHiddenConsole } from '../shared/hidden-exec-file.js';

const execFileAsync = promisify(execFile);

/** npm package that ships the `reqlan` / `rq` binaries. */
export const CLI_PACKAGE_NAME = '@reqlan/cli';

/** Registry manifest of the latest stable release. */
const LATEST_MANIFEST_URL = `https://registry.npmjs.org/${encodeURIComponent(CLI_PACKAGE_NAME)}/latest`;

/** Spawn timeout so a hanging shell or registry cannot stall the host. */
const CLI_VERSION_TIMEOUT_MS = 3_000;

/** Both binaries come from the same npm package; the first on PATH decides. */
const CLI_BINARIES = ['reqlan', 'rq'] as const;

/** Strict release form. Prerelease tags stay outside the check. */
const CLI_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** `showWarningMessage` button that opens the upgrade terminal. */
export const UPGRADE_BUTTON = 'Upgrade CLI';

/** First `X.Y.Z` token in CLI `--version` output; null when the output has none. */
export function parseCliVersionOutput(stdout: string): string | null {
    const match = /\d+\.\d+\.\d+/.exec(stdout);
    return match?.[0] ?? null;
}

/** -1 when `a` is older, 0 when equal, 1 when `a` is newer. */
export function compareSemver(a: string, b: string): number {
    const left = parseSemverTriple(a);
    const right = parseSemverTriple(b);
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return left[index] < right[index] ? -1 : 1;
        }
    }
    return 0;
}

function parseSemverTriple(version: string): [number, number, number] {
    if (!CLI_VERSION_PATTERN.test(version)) {
        throw new Error(`Invalid semver: ${version}`);
    }
    const parts = version.split('.');
    const major = Number(parts[0]);
    const minor = Number(parts[1]);
    const patch = Number(parts[2]);
    return [major, minor, patch];
}

/** Installed CLI version from the first binary found on PATH; null when none runs. */
export async function readInstalledCliVersion(): Promise<string | null> {
    for (const binary of CLI_BINARIES) {
        try {
            const { stdout } = await execFileAsync(
                binary,
                ['--version'],
                withHiddenConsole({ encoding: 'utf8' as const, timeout: CLI_VERSION_TIMEOUT_MS })
            );
            const version = parseCliVersionOutput(stdout);
            if (version !== null) {
                return version;
            }
        } catch {
            // Missing binary or failed run — the next binary decides.
        }
    }
    return null;
}

type LatestManifest = { version?: unknown };

/** Latest stable CLI version from the npm registry; null when unreachable or malformed. */
export async function readLatestCliVersion(): Promise<string | null> {
    try {
        const response = await fetch(LATEST_MANIFEST_URL, { headers: { accept: 'application/json' } });
        if (!response.ok) {
            return null;
        }
        const manifest = (await response.json()) as LatestManifest;
        return typeof manifest.version === 'string' && CLI_VERSION_PATTERN.test(manifest.version)
            ? manifest.version
            : null;
    } catch {
        return null;
    }
}

#!/usr/bin/env node
/**
 * Extension production build — see reqlan rq/development/build.rq
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(extensionRoot, '../..');
const cachePath = join(extensionRoot, 'out', '.extension-build-cache.json');
const cacheVersion = 1;
const force = process.argv.includes('--force') || process.env.REQLAN_BUILD_FORCE === '1';

const fromExtension = (...parts) => join(extensionRoot, ...parts);
const fromRepo = (...parts) => join(repoRoot, ...parts);
const sharedInputs = [
    fromExtension('package.json'),
    fromRepo('pnpm-lock.yaml'),
    fromExtension('scripts', 'build.mjs'),
];
const sharedWebviewInputs = [
    fromExtension('webviews', 'shared'),
    fromExtension('src', 'webview_module', 'shared'),
    fromRepo('packages', 'analytical', 'out'),
];

/**
 * @typedef {{
 *   readonly name: string;
 *   readonly command: string;
 *   readonly cacheKey?: string;
 *   readonly inputs?: readonly string[];
 *   readonly outputs?: readonly string[];
 * }} BuildStep
 */

/** @type {readonly BuildStep[]} */
const steps = [
    {
        name: 'generate Langium sources and TextMate grammar',
        command: 'pnpm --dir ../.. run langium:generate',
        cacheKey: 'langium-generate',
        inputs: [
            ...sharedInputs,
            fromRepo('packages', 'language', 'langium-config.json'),
            fromRepo('packages', 'language', 'src', 'reqlan.langium'),
            fromRepo('packages', 'language', 'scripts', 'patch-textmate.mjs'),
        ],
        outputs: [
            fromRepo('packages', 'language', 'src', 'generated'),
            fromRepo('packages', 'language', 'syntaxes', 'reqlan.tmLanguage.json'),
        ],
    },
    {
        name: 'generate shared graph physics source',
        command: 'node ../analytical/scripts/generate-physics-core-source.mjs',
        cacheKey: 'physics-source',
        inputs: [
            ...sharedInputs,
            fromRepo('packages', 'analytical', 'scripts', 'generate-physics-core-source.mjs'),
            fromRepo('packages', 'analytical', 'src', 'graph', 'physics-core.js'),
        ],
        outputs: [
            fromRepo('packages', 'analytical', 'src', 'graph', 'physics-core-source.ts'),
        ],
    },
    {
        name: 'generate logo media for VSIX packaging',
        command: 'pnpm run build:media',
        cacheKey: 'media',
        inputs: [
            ...sharedInputs,
            fromExtension('scripts', 'generate-media.mjs'),
            fromRepo('site', 'public', 'logo.svg'),
        ],
        outputs: [
            fromExtension('media', 'logo.svg'),
            fromExtension('media', 'logo.png'),
            fromExtension('media', 'logo-256.png'),
            fromExtension('media', 'logo.webp'),
        ],
    },
    {
        name: 'generate README for VSIX packaging',
        command: 'pnpm run build:readme',
        cacheKey: 'readme',
        inputs: [
            ...sharedInputs,
            fromExtension('scripts', 'generate-readme.ts'),
            fromExtension('README.template.md'),
            fromExtension('CHANGELOG.md'),
            fromRepo('scripts', 'phonebook.ts'),
            fromRepo('reqlan rq', 'phonebook.json'),
        ],
        outputs: [fromExtension('README.md')],
    },
    {
        name: 'prepare TextMate syntaxes',
        command: 'pnpm run build:syntaxes',
        cacheKey: 'syntaxes',
        inputs: [
            ...sharedInputs,
            fromRepo('packages', 'language', 'syntaxes', 'reqlan.tmLanguage.json'),
            fromExtension('grammars', 'reqlan-comment.injection.json'),
        ],
        outputs: [
            fromExtension('syntaxes', 'reqlan.tmLanguage.json'),
            fromExtension('syntaxes', 'reqlan-comment.injection.json'),
        ],
    },
    {
        name: 'sync Cursor skills',
        command: 'node ../../scripts/sync-cursor-ai.mjs',
    },
    {
        name: 'type-check extension TypeScript sources',
        command: 'node ../../node_modules/typescript/bin/tsc -b tsconfig.json',
    },
    {
        name: 'bundle Ideas Summary webview',
        command: 'npx vite build --config webviews/ideas-summary/vite.config.ts',
        cacheKey: 'webview-ideas-summary',
        inputs: [
            ...sharedInputs,
            ...sharedWebviewInputs,
            fromExtension('webviews', 'ideas-summary'),
        ],
        outputs: [fromExtension('media', 'webviews', 'ideas-summary')],
    },
    {
        name: 'bundle activity bar webview',
        command: 'npx vite build --config webviews/activity-bar/vite.config.ts',
        cacheKey: 'webview-activity-bar',
        inputs: [
            ...sharedInputs,
            ...sharedWebviewInputs,
            fromExtension('webviews', 'activity-bar'),
            fromExtension('src', 'activity_bar_module'),
        ],
        outputs: [fromExtension('media', 'webviews', 'activity-bar')],
    },
    {
        name: 'bundle onboarding webview',
        command: 'npx vite build --config webviews/onboarding/vite.config.ts',
        cacheKey: 'webview-onboarding',
        inputs: [
            ...sharedInputs,
            fromExtension('webviews', 'onboarding'),
            fromExtension('src', 'extension', 'onboarding-messages.ts'),
            fromExtension('templates', 'thanks-for-installing.template.rq'),
        ],
        outputs: [fromExtension('media', 'webviews', 'onboarding')],
    },
    {
        name: 'bundle export form webview',
        command: 'npx vite build --config webviews/export-form/vite.config.ts',
        cacheKey: 'webview-export-form',
        inputs: [
            ...sharedInputs,
            fromExtension('webviews', 'export-form'),
            fromExtension('src', 'analytical_submodule', 'export', 'export-form-messages.ts'),
            fromExtension('src', 'analytical_submodule', 'export', 'export-form-settings-types.ts'),
        ],
        outputs: [fromExtension('media', 'webviews', 'export-form')],
    },
    {
        name: 'bundle index diagnostics webview',
        command: 'npx vite build --config webviews/index-diagnostics/vite.config.ts',
        cacheKey: 'webview-index-diagnostics',
        inputs: [
            ...sharedInputs,
            fromExtension('webviews', 'index-diagnostics'),
            fromExtension('src', 'diagnostics_module', 'index-diagnostics-messages.ts'),
        ],
        outputs: [fromExtension('media', 'webviews', 'index-diagnostics')],
    },
    {
        name: 'bundle extension host and language server',
        command: 'node esbuild.mjs',
        cacheKey: 'extension-host',
        inputs: [
            ...sharedInputs,
            fromExtension('esbuild.mjs'),
            fromExtension('src'),
            fromRepo('packages', 'analytical', 'out'),
            fromRepo('packages', 'analytical', 'node_modules', 'sql.js', 'dist', 'sql-asm.js'),
            fromRepo('packages', 'language', 'out'),
            fromRepo('reqlan rq', 'phonebook.json'),
        ],
        outputs: [
            fromExtension('out', 'extension', 'main.cjs'),
            fromExtension('out', 'extension', 'main.cjs.map'),
            fromExtension('out', 'extension', 'vendor', 'sql-asm.cjs'),
            fromExtension('out', 'extension', 'vendor', 'sql-asm.cjs.map'),
            fromExtension('out', 'language', 'main.cjs'),
            fromExtension('out', 'language', 'main.cjs.map'),
            fromExtension('out', 'language', 'reqlan-parse-worker.cjs'),
            fromExtension('out', 'language', 'reqlan-parse-worker.cjs.map'),
        ],
    },
];

function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
}

async function loadCache() {
    try {
        const parsed = JSON.parse(await readFile(cachePath, 'utf8'));
        if (parsed.version === cacheVersion && parsed.steps && typeof parsed.steps === 'object') {
            return parsed;
        }
    } catch {
        // Missing or invalid cache: perform a cold build.
    }
    return { version: cacheVersion, steps: {} };
}

async function saveCache(cache) {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

async function filesUnder(path) {
    try {
        const info = await stat(path);
        if (info.isFile()) {
            return [path];
        }
        if (!info.isDirectory()) {
            return [];
        }
        const entries = await readdir(path, { withFileTypes: true });
        const nested = await Promise.all(
            entries
                .sort((left, right) => left.name.localeCompare(right.name))
                .map(entry => filesUnder(join(path, entry.name)))
        );
        return nested.flat();
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

export async function fingerprint(paths, command) {
    const hash = createHash('sha256');
    hash.update(`cache-v${cacheVersion}\0node-${process.versions.node}\0${command}\0`);
    for (const path of [...paths].sort()) {
        const files = await filesUnder(path);
        if (files.length === 0) {
            hash.update(`missing-or-empty:${relative(repoRoot, path)}\0`);
            continue;
        }
        for (const file of files) {
            hash.update(`${relative(repoRoot, file)}\0`);
            hash.update(await readFile(file));
            hash.update('\0');
        }
    }
    return hash.digest('hex');
}

export async function cacheStatus(step, cached) {
    if (!step.inputs || !step.outputs) {
        return { fresh: false, inputHash: undefined };
    }
    const inputHash = await fingerprint(step.inputs, step.command);
    if (cached?.inputHash !== inputHash) {
        return { fresh: false, inputHash };
    }
    const outputHash = await fingerprint(step.outputs, step.command);
    return { fresh: cached.outputHash === outputHash, inputHash };
}

async function runStep(step, index, cache) {
    const label = `${index + 1}/${steps.length} ${step.name}`;
    console.log(`\n[build] ${label}`);

    let inputHash;
    if (!force && step.cacheKey && step.inputs && step.outputs) {
        const cached = cache.steps[step.cacheKey];
        const status = await cacheStatus(step, cached);
        inputHash = status.inputHash;
        if (status.fresh) {
            console.log('[build] up to date');
            return;
        }
    }

    console.log(`[build] $ ${step.command}`);
    const started = Date.now();
    execSync(step.command, { cwd: extensionRoot, stdio: 'inherit' });
    console.log(`[build] done (${formatDuration(Date.now() - started)})`);

    if (step.cacheKey && step.inputs && step.outputs) {
        inputHash ??= await fingerprint(step.inputs, step.command);
        cache.steps[step.cacheKey] = {
            inputHash,
            outputHash: await fingerprint(step.outputs, step.command),
        };
        await saveCache(cache);
    }
}

async function main() {
    console.log(`[build] extension production build${force ? ' (forced)' : ' (incremental)'}`);
    console.log(`[build] cwd: ${extensionRoot}`);

    const buildStarted = Date.now();
    const cache = await loadCache();

    for (const [index, step] of steps.entries()) {
        await runStep(step, index, cache);
    }

    console.log(`\n[build] succeeded in ${formatDuration(Date.now() - buildStarted)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}

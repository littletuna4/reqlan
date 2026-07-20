#!/usr/bin/env node
/**
 * Extension production build — see reqlan rq/development/build.rq
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {readonly { readonly name: string; readonly command: string }[]} */
const steps = [
    {
        name: 'generate logo media for VSIX packaging',
        command: 'pnpm run build:media',
    },
    {
        name: 'generate README for VSIX packaging',
        command: 'pnpm run build:readme',
    },
    {
        name: 'generate onboarding rq for VSIX packaging',
        command: 'pnpm run build:onboarding',
    },
    {
        name: 'prepare syntaxes and sync Cursor skills',
        command: 'pnpm run build:prepare',
    },
    {
        name: 'bundle Svelte webviews (ideas-summary, activity-bar)',
        command: 'npx vite build --config webviews/ideas-summary/vite.config.ts && npx vite build --config webviews/activity-bar/vite.config.ts',
    },
    {
        name: 'type-check extension TypeScript sources',
        command: 'pnpm exec tsc -b tsconfig.json',
    },
    {
        name: 'bundle extension host and language server',
        command: 'node esbuild.mjs',
    },
];

function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
}

function runStep(step, index) {
    const label = `${index + 1}/${steps.length} ${step.name}`;
    console.log(`\n[build] ${label}`);
    console.log(`[build] $ ${step.command}`);

    const started = Date.now();
    execSync(step.command, { cwd: extensionRoot, stdio: 'inherit' });
    console.log(`[build] done (${formatDuration(Date.now() - started)})`);
}

console.log('[build] extension production build');
console.log(`[build] cwd: ${extensionRoot}`);

const buildStarted = Date.now();

for (const [index, step] of steps.entries()) {
    runStep(step, index);
}

console.log(`\n[build] succeeded in ${formatDuration(Date.now() - buildStarted)}`);

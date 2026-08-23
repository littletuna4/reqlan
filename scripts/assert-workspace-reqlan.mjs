/**
 * Fail when an @reqlan package resolves outside this repo's packages/ tree.
 * GitHub CI uses this after `pnpm install` so check and tests consume the
 * workspace packages, not registry tarballs.
 *
 * rq:["../reqlan rq/distribution/distribution.rq".ci_gate]
 * rq:["../reqlan rq/core_analysis/check.rq".check_meta_implementation]
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesRoot = realpathSync(join(root, 'packages'));

const names = [
    '@reqlan/cli',
    '@reqlan/analytical',
    '@reqlan/language',
    '@reqlan/mcp',
    '@reqlan/analytical-linux-x64-gnu',
    '@reqlan/analytical-linux-arm64-gnu',
    '@reqlan/analytical-darwin-x64',
    '@reqlan/analytical-darwin-arm64',
    '@reqlan/analytical-win32-x64-msvc',
    '@reqlan/analytical-win32-arm64-msvc'
];

function packageLink(name) {
    const candidates = [
        join(root, 'node_modules', ...name.split('/')),
        join(root, 'packages/analytical/node_modules', ...name.split('/'))
    ];
    return candidates.find(candidate => existsSync(candidate));
}

function assertUnderPackages(name) {
    const linked = packageLink(name);
    if (linked === undefined) {
        throw new Error(`${name} is not linked under node_modules`);
    }
    const real = realpathSync(linked);
    const rel = relative(packagesRoot, real);
    if (rel.startsWith('..')) {
        throw new Error(`${name} is not the workspace package:\n  ${real}`);
    }
    console.log(`${name} → ${rel}`);
}

for (const name of names) {
    assertUnderPackages(name);
}

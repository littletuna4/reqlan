/**
 * Fail when an @reqlan package resolves outside this repo's packages/ tree.
 * GitHub CI uses this after `pnpm install` so check and tests consume the
 * workspace packages, not registry tarballs.
 *
 * Publishable JS packages are `workspace:*` dependencies. Platform natives are
 * linked the same way in this repo via pnpm `packageExtensions` (checkout
 * packages, not npm). The published `@reqlan/analytical` tarball lists them as
 * pinned optionalDependencies.
 *
 * rq:["../reqlan rq/distribution/distribution.rq".ci_gate]
 * rq:["../reqlan rq/core_analysis/check.rq".check_meta_implementation]
 * rq:["../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_TARGETS } from './native-targets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesRoot = realpathSync(join(root, 'packages'));

const linkedNames = [
    '@reqlan/cli',
    '@reqlan/analytical',
    '@reqlan/language',
    '@reqlan/mcp',
    ...NATIVE_TARGETS.map((target) => target.packageName),
];

function packageLink(name) {
    const candidates = [
        join(root, 'node_modules', ...name.split('/')),
        join(root, 'packages/analytical/node_modules', ...name.split('/')),
    ];
    return candidates.find((candidate) => existsSync(candidate));
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

for (const name of linkedNames) {
    assertUnderPackages(name);
}

/**
 * Make the workspace host optionalDependency look like a production npm install:
 * `packages/analytical-native/<napiSuffix>/<binary>` is the package `main`.
 *
 * Order:
 *   1. Keep an existing host `.node` in the workspace platform package.
 *   2. Fetch that package from npm (`fetch-native-packages.mjs --host-only`).
 *   3. Build and stage with cargo (`stage-host-native.mjs`, forced).
 *
 * Usage:
 *   node scripts/ensure-host-native.mjs
 *   node scripts/ensure-host-native.mjs --no-build   # fetch / existing only
 *
 * rq:["../reqlan rq/distribution/native_host_binary.rq".native_host_binary_development]
 * rq:["../reqlan rq/development/build.rq".extension_host_native_stage]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostNativeTarget } from './native-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const noBuild = argv.includes('--no-build');

const target = hostNativeTarget();
if (!target) {
    throw new Error(`No native target for ${process.platform}-${process.arch}`);
}

function binaryExists(filePath) {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

function packageBinaryPath() {
    return path.join(root, 'packages/analytical-native', target.napiSuffix, target.binaryName);
}

function run(command, args, env = process.env) {
    const result = spawnSync(command, args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env,
    });
    return result.status === 0;
}

if (binaryExists(packageBinaryPath())) {
    console.log(`host native package already present: ${packageBinaryPath()}`);
    process.exit(0);
}

console.log(`fetch host native package ${target.packageName} from npm`);
run(process.execPath, [path.join(root, 'scripts/fetch-native-packages.mjs'), '--host-only']);
if (binaryExists(packageBinaryPath())) {
    console.log(`fetched ${packageBinaryPath()}`);
    process.exit(0);
}

if (noBuild) {
    throw new Error(
        `Host native optionalDependency is missing for ${target.napiSuffix}. ` +
            `Publish ${target.packageName} or omit --no-build so cargo can build reqlan-napi.`
    );
}

console.log('npm host package unavailable; building reqlan-napi for the workspace package');
const ok = run(process.execPath, [path.join(root, 'scripts/stage-host-native.mjs')], {
    ...process.env,
    REQLAN_FORCE_NATIVE_BUILD: '1',
});
if (!ok || !binaryExists(packageBinaryPath())) {
    throw new Error(
        `Failed to populate ${packageBinaryPath()}. ` +
            `Fetch ${target.packageName} from npm or install Rust and retry.`
    );
}
console.log(`staged ${packageBinaryPath()}`);

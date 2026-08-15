/**
 * Build (when needed) and stage the host-matching core engine `.node` into
 * packages/extension/native/ so F5 and local extension builds load the same
 * layout as a per-target VSIX.
 *
 * Usage:
 *   node scripts/stage-host-native.mjs
 *   node scripts/stage-host-native.mjs --no-build   # stage an existing binary only
 *
 * CI / Azure (CI or TF_BUILD) skip cargo and exit 0 when no binary is present;
 * those pipelines fetch platform packages later via fetch-native-packages.mjs.
 *
 * rq:["../reqlan rq/distribution/distribution.rq".extension_host_target]
 * rq:["../reqlan rq/development/build.rq".incremental_extension_build]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostNativeTarget } from './native-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionNativeDir = path.join(root, 'packages/extension/native');
const argv = process.argv.slice(2);
const noBuild = argv.includes('--no-build');
const ciSkip =
    process.env.REQLAN_SKIP_NATIVE_BUILD === '1' ||
    (process.env.REQLAN_FORCE_NATIVE_BUILD !== '1' &&
        Boolean(process.env.CI || process.env.TF_BUILD));

const target = hostNativeTarget();
if (!target) {
    throw new Error(`No native target for ${process.platform}-${process.arch}`);
}

function run(command, args, cwd = root) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: process.env,
    });
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
    }
}

function binaryExists(filePath) {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

function packageBinaryPath() {
    return path.join(root, 'packages/analytical-native', target.napiSuffix, target.binaryName);
}

function stagedBinaryPath() {
    return path.join(extensionNativeDir, 'reqlan_napi.node');
}

function artifactBinaryPath() {
    return path.join(root, 'artifacts/napi', target.napiSuffix, target.binaryName);
}

function findExistingBinary() {
    const candidates = [packageBinaryPath(), artifactBinaryPath(), stagedBinaryPath()];
    return candidates.find((candidate) => binaryExists(candidate));
}

function stage(src) {
    fs.mkdirSync(extensionNativeDir, { recursive: true });
    const dest = stagedBinaryPath();
    fs.copyFileSync(src, dest);
    const pkgDest = packageBinaryPath();
    fs.mkdirSync(path.dirname(pkgDest), { recursive: true });
    if (path.resolve(src) !== path.resolve(pkgDest)) {
        fs.copyFileSync(src, pkgDest);
    }
    const meta = {
        packageName: target.packageName,
        napiSuffix: target.napiSuffix,
        vsCodeTarget: target.vsCodeTarget,
        binaryName: 'reqlan_napi.node',
    };
    fs.writeFileSync(path.join(extensionNativeDir, 'target.json'), `${JSON.stringify(meta, null, 4)}\n`);
    console.log(`staged ${src} → ${dest} (${target.vsCodeTarget})`);
}

const existing = findExistingBinary();
if (existing && (noBuild || ciSkip)) {
    stage(existing);
    process.exit(0);
}
if (noBuild) {
    throw new Error(
        `Native analytical engine is missing for ${target.napiSuffix}. ` +
            `Build crates/reqlan-napi or omit --no-build.`
    );
}
if (ciSkip) {
    console.log(
        `skip host native build (${target.napiSuffix}): CI/Azure fetches platform packages later`
    );
    process.exit(0);
}

console.log('cargo build -p reqlan-napi --release');
run('cargo', ['build', '-p', 'reqlan-napi', '--release'], path.join(root, 'crates'));
run(process.execPath, [
    path.join(root, 'scripts/collect-napi-binary.mjs'),
    '--target',
    target.napiSuffix,
]);

const collected = artifactBinaryPath();
if (!binaryExists(collected)) {
    throw new Error(
        `Native analytical engine was not produced for ${target.napiSuffix}. ` +
            `Expected ${collected} after cargo build -p reqlan-napi.`
    );
}

stage(collected);

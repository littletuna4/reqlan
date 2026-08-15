/**
 * Local dry-run pack of the host `@reqlan/analytical-<platform>-<arch>` package.
 * Collects the built napi binary, stages the platform package, then `npm pack`
 * (does not publish).
 *
 * Usage:
 *   node scripts/pack-host-native-package.mjs
 *   node scripts/pack-host-native-package.mjs --target linux-x64-gnu
 *
 * rq:["../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostNativeTarget, NATIVE_TARGETS } from './native-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArg(argv, name) {
    const eq = argv.find((a) => a.startsWith(`${name}=`));
    if (eq) {
        return eq.slice(name.length + 1);
    }
    const idx = argv.indexOf(name);
    if (idx !== -1 && argv[idx + 1]) {
        return argv[idx + 1];
    }
    return undefined;
}

const argv = process.argv.slice(2);
const only = parseArg(argv, '--target');
const cargoTargetDir = parseArg(argv, '--cargo-target-dir');
const target = only
    ? NATIVE_TARGETS.find((t) => t.napiSuffix === only || t.vsCodeTarget === only)
    : hostNativeTarget();

if (!target) {
    throw new Error(`No native target for ${only ?? `${process.platform}-${process.arch}`}`);
}

function run(command, args, cwd = root) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
    }
}

run(process.execPath, [
    path.join(root, 'scripts/collect-napi-binary.mjs'),
    '--target',
    target.napiSuffix,
    ...(cargoTargetDir ? ['--cargo-target-dir', cargoTargetDir] : []),
]);
run(process.execPath, [
    path.join(root, 'scripts/prepare-native-packages.mjs'),
    '--binary-dir',
    'artifacts/napi',
    '--target',
    target.napiSuffix,
]);

const pkgDir = path.join(root, 'packages/analytical-native', target.napiSuffix);
const binary = path.join(pkgDir, target.binaryName);
if (!fs.existsSync(binary) || fs.statSync(binary).size === 0) {
    throw new Error(`Refusing to pack ${target.packageName}: missing ${binary}`);
}

const outDir = path.join(root, 'artifacts/npm');
fs.mkdirSync(outDir, { recursive: true });
run('npm', ['pack', '--pack-destination', outDir], pkgDir);
console.log(`packed ${target.packageName} → ${outDir}`);

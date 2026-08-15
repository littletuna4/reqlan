/**
 * Copy a built reqlan-napi artifact into artifacts/napi/<suffix>/ with the
 * canonical platform binary name used by prepare-native-packages.mjs.
 *
 * Usage:
 *   node scripts/collect-napi-binary.mjs --target linux-x64-gnu [--cargo-target-dir crates/target]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_TARGETS } from './native-targets.mjs';

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
const suffixOrVsCode = parseArg(argv, '--target');
const cargoTargetDir = path.resolve(
    root,
    parseArg(argv, '--cargo-target-dir') ?? 'crates/target'
);
const outRoot = path.resolve(root, parseArg(argv, '--out') ?? 'artifacts/napi');

const target =
    NATIVE_TARGETS.find((t) => t.napiSuffix === suffixOrVsCode || t.vsCodeTarget === suffixOrVsCode) ??
    (() => {
        throw new Error(`Unknown --target ${suffixOrVsCode}`);
    })();

const searchRoots = [
    path.join(cargoTargetDir, target.rustTarget, 'release'),
    path.join(cargoTargetDir, 'release'),
    path.join(cargoTargetDir, target.rustTarget, 'debug'),
    path.join(cargoTargetDir, 'debug'),
];

const names = [
    target.binaryName,
    'reqlan_napi.node',
    'libreqlan_napi.so',
    'reqlan_napi.so',
    'libreqlan_napi.dylib',
    'reqlan_napi.dylib',
    'reqlan_napi.dll',
];

let found;
for (const dir of searchRoots) {
    for (const name of names) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
            found = candidate;
            break;
        }
    }
    if (found) {
        break;
    }
}

if (!found) {
    throw new Error(
        `Could not find reqlan-napi binary for ${target.napiSuffix}. Searched under:\n` +
            searchRoots.join('\n')
    );
}

const destDir = path.join(outRoot, target.napiSuffix);
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, target.binaryName);
fs.copyFileSync(found, dest);
console.log(`collected ${found} → ${dest}`);

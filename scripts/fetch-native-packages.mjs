/**
 * Fetch published `@reqlan/analytical-<platform>` tarballs from npm into
 * packages/analytical-native/ so Azure (or local) can stage them into VSIXes
 * without rebuilding every Rust target on one agent.
 *
 * Usage:
 *   node scripts/fetch-native-packages.mjs
 *   node scripts/fetch-native-packages.mjs --allow-missing
 *   node scripts/fetch-native-packages.mjs --version 0.9.1
 *
 * rq:["../reqlan rq/distribution/distribution.rq".vsix_export]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_TARGETS, hostNativeTarget } from './native-targets.mjs';

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
const hostOnly = argv.includes('--host-only');
const allowMissing = argv.includes('--allow-missing');
const analytical = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/analytical/package.json'), 'utf8')
);
const version = parseArg(argv, '--version') ?? analytical.version;
const targets = hostOnly
    ? (() => {
          const host = hostNativeTarget();
          if (!host) {
              throw new Error(`No native target for ${process.platform}-${process.arch}`);
          }
          return [host];
      })()
    : NATIVE_TARGETS;

// Ensure package.json skeletons exist and optionalDeps are synced.
spawnSync(process.execPath, [path.join(root, 'scripts/prepare-native-packages.mjs')], {
    cwd: root,
    stdio: 'inherit',
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reqlan-napi-'));
let failed = 0;

for (const target of targets) {
    const spec = `${target.packageName}@${version}`;
    console.log(`npm pack ${spec}`);
    const pack = spawnSync('npm', ['pack', spec, '--pack-destination', tmp], {
        cwd: root,
        encoding: 'utf8',
        shell: process.platform === 'win32',
    });
    if (pack.status !== 0) {
        console.error(pack.stderr || pack.stdout);
        console.error(`Failed to pack ${spec}`);
        failed += 1;
        continue;
    }
    const tgzName = (pack.stdout || '').trim().split('\n').filter(Boolean).pop();
    if (!tgzName) {
        console.error(`npm pack produced no tarball name for ${spec}`);
        failed += 1;
        continue;
    }
    const tgz = path.join(tmp, tgzName);
    const extractDir = path.join(tmp, target.napiSuffix);
    fs.mkdirSync(extractDir, { recursive: true });
    const untar = spawnSync('tar', ['-xzf', tgz, '-C', extractDir], { encoding: 'utf8' });
    if (untar.status !== 0) {
        console.error(untar.stderr);
        failed += 1;
        continue;
    }
    const packedRoot = path.join(extractDir, 'package');
    const srcBinary = path.join(packedRoot, target.binaryName);
    if (!fs.existsSync(srcBinary) || fs.statSync(srcBinary).size === 0) {
        console.error(`Packed tarball missing binary: ${srcBinary}`);
        failed += 1;
        continue;
    }
    const destDir = path.join(root, 'packages/analytical-native', target.napiSuffix);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcBinary, path.join(destDir, target.binaryName));
    // Refresh package.json from the published tarball when present.
    const publishedPkg = path.join(packedRoot, 'package.json');
    if (fs.existsSync(publishedPkg)) {
        fs.copyFileSync(publishedPkg, path.join(destDir, 'package.json'));
    }
    console.log(`fetched ${spec} → ${path.join(destDir, target.binaryName)}`);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed > 0) {
    const message = `Failed to fetch ${failed} platform package(s) at version ${version}.`;
    if (allowMissing) {
        console.warn(`${message} Continuing (--allow-missing).`);
        process.exit(0);
    }
    console.error(message);
    process.exit(1);
}

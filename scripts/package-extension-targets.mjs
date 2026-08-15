/**
 * Stage one host-matching native package into the extension tree for VSIX packaging,
 * then run `vsce package --target <tuple> --no-dependencies` for each (or one) target.
 *
 * Usage:
 *   node scripts/package-extension-targets.mjs
 *   node scripts/package-extension-targets.mjs --target linux-x64
 *   node scripts/package-extension-targets.mjs --native-dir packages/analytical-native
 *   node scripts/package-extension-targets.mjs --publish
 *
 * rq:["../reqlan rq/distribution/distribution.rq".vsix_export]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_TARGETS, targetByVsCode } from './native-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'packages', 'extension');
const nativeStageDir = path.join(extensionDir, 'native');

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
const onlyTarget = parseArg(argv, '--target');
const nativeDir = path.resolve(
    root,
    parseArg(argv, '--native-dir') ?? 'packages/analytical-native'
);
const doPublish = argv.includes('--publish');
const doOpenVsx = argv.includes('--openvsx');

const targets = onlyTarget
    ? (() => {
          const t = targetByVsCode(onlyTarget) ?? NATIVE_TARGETS.find((x) => x.napiSuffix === onlyTarget);
          if (!t) {
              throw new Error(`Unknown --target ${onlyTarget}`);
          }
          return [t];
      })()
    : NATIVE_TARGETS;

const extensionPkg = JSON.parse(
    fs.readFileSync(path.join(extensionDir, 'package.json'), 'utf8')
);
const version = extensionPkg.version;

function stageNative(target) {
    fs.rmSync(nativeStageDir, { recursive: true, force: true });
    fs.mkdirSync(nativeStageDir, { recursive: true });

    const srcDir = path.join(nativeDir, target.napiSuffix);
    const srcBinary = path.join(srcDir, target.binaryName);
    if (!fs.existsSync(srcBinary) || fs.statSync(srcBinary).size === 0) {
        throw new Error(
            `Missing native binary for ${target.vsCodeTarget}: ${srcBinary}\n` +
                `Build and prepare packages first (prepare-native-packages.mjs --binary-dir …).`
        );
    }

    const destBinary = path.join(nativeStageDir, 'reqlan_napi.node');
    fs.copyFileSync(srcBinary, destBinary);

    const meta = {
        packageName: target.packageName,
        napiSuffix: target.napiSuffix,
        vsCodeTarget: target.vsCodeTarget,
        binaryName: 'reqlan_napi.node',
    };
    fs.writeFileSync(path.join(nativeStageDir, 'target.json'), `${JSON.stringify(meta, null, 4)}\n`);
    console.log(`staged ${srcBinary} → ${destBinary} (${target.vsCodeTarget})`);
}

function runVsce(args) {
    const result = spawnSync('pnpm', ['exec', 'vsce', ...args], {
        cwd: extensionDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
        throw new Error(`vsce ${args.join(' ')} failed with exit ${result.status}`);
    }
}

function runOvsx(vsixPath) {
    const result = spawnSync('pnpm', ['dlx', 'ovsx', 'publish', vsixPath], {
        cwd: extensionDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: process.env,
    });
    if (result.status !== 0) {
        throw new Error(`ovsx publish ${vsixPath} failed with exit ${result.status}`);
    }
}

const outDir = path.join(extensionDir, 'vsix-out');
fs.mkdirSync(outDir, { recursive: true });

for (const target of targets) {
    stageNative(target);
    const outName = `reqlan-extension-${version}-${target.vsCodeTarget}.vsix`;
    const outPath = path.join(outDir, outName);
    runVsce([
        'package',
        '--no-dependencies',
        '--target',
        target.vsCodeTarget,
        '--out',
        outPath,
    ]);
    console.log(`packaged ${outPath}`);

    if (doPublish) {
        runVsce(['publish', '--no-dependencies', '--packagePath', outPath, '--azure-credential']);
        console.log(`published Marketplace ${outName}`);
    }
    if (doOpenVsx) {
        runOvsx(outPath);
        console.log(`published Open VSX ${outName}`);
    }
}

// Leave host-matching binary staged for local F5 when packaging only the host target.
if (targets.length === 1) {
    console.log(`native/ left staged for ${targets[0].vsCodeTarget}`);
} else {
    fs.rmSync(nativeStageDir, { recursive: true, force: true });
    console.log('cleared native/ after multi-target packaging');
}

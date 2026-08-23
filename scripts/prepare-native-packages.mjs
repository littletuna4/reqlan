/**
 * Scaffold / refresh `@reqlan/analytical-<platform>-<arch>` package directories.
 *
 * Version SSOT is `packages/analytical/package.json`. Platform packages are
 * Changesets-ignored. Git `packages/analytical/package.json` does not list them
 * as optionalDependencies (that would make `changeset version` refuse). This
 * workspace still links checkout packages via `packageExtensions` in
 * `pnpm-workspace.yaml`. `--publish-versions` writes pinned optionalDependencies
 * onto `@reqlan/analytical` for the npm publish checkout only.
 *
 * Usage:
 *   node scripts/prepare-native-packages.mjs
 *   node scripts/prepare-native-packages.mjs --binary-dir artifacts/napi
 *   node scripts/prepare-native-packages.mjs --target linux-x64-gnu
 *   node scripts/prepare-native-packages.mjs --publish-versions
 *
 * rq:["../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 * rq:["../reqlan rq/distribution/distribution.rq".version_management]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_TARGETS } from './native-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'packages', 'analytical-native');
const analyticalPkgPath = path.join(root, 'packages', 'analytical', 'package.json');

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
const binaryDir = parseArg(argv, '--binary-dir');
const onlySuffix = parseArg(argv, '--target');
const publishVersions = argv.includes('--publish-versions');

const analytical = JSON.parse(fs.readFileSync(analyticalPkgPath, 'utf8'));
const version = analytical.version;

const targets = onlySuffix
    ? NATIVE_TARGETS.filter((t) => t.napiSuffix === onlySuffix || t.vsCodeTarget === onlySuffix)
    : NATIVE_TARGETS;

if (targets.length === 0) {
    throw new Error(`No native targets matched --target ${onlySuffix}`);
}

fs.mkdirSync(outRoot, { recursive: true });

/** @type {Record<string, string>} */
const optionalDependencies = {};

for (const target of targets) {
    const dir = path.join(outRoot, target.napiSuffix);
    fs.mkdirSync(dir, { recursive: true });

    const pkg = {
        name: target.packageName,
        version,
        description: `Native reqlan analytical engine for ${target.napiSuffix}`,
        license: 'AGPL-3.0-only',
        repository: {
            type: 'git',
            url: 'https://github.com/littletuna4/reqlan.git',
        },
        os: target.os,
        cpu: target.cpu,
        main: target.binaryName,
        files: [target.binaryName],
        publishConfig: {
            access: 'public',
        },
    };
    fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 4)}\n`);

    if (binaryDir) {
        const candidates = [
            path.join(binaryDir, target.binaryName),
            path.join(binaryDir, target.napiSuffix, target.binaryName),
            path.join(binaryDir, 'reqlan_napi.node'),
            path.join(binaryDir, target.napiSuffix, 'reqlan_napi.node'),
        ];
        const src = candidates.find((p) => fs.existsSync(p));
        if (!src) {
            throw new Error(
                `No binary for ${target.napiSuffix} under ${binaryDir}. Tried:\n${candidates.join('\n')}`
            );
        }
        fs.copyFileSync(src, path.join(dir, target.binaryName));
        console.log(`copied ${src} → ${path.join(dir, target.binaryName)}`);
    }

    optionalDependencies[target.packageName] = version;
    console.log(`prepared ${target.packageName}@${version}`);
}

if (publishVersions) {
    if (onlySuffix) {
        const existing = analytical.optionalDependencies ?? {};
        for (const [name, ver] of Object.entries(existing)) {
            if (!(name in optionalDependencies)) {
                optionalDependencies[name] = ver === 'workspace:*' ? version : ver;
            }
        }
    }
    analytical.optionalDependencies = optionalDependencies;
    fs.writeFileSync(analyticalPkgPath, `${JSON.stringify(analytical, null, 4)}\n`);
    console.log(`updated optionalDependencies on @reqlan/analytical@${version} (publish versions)`);
} else if ('optionalDependencies' in analytical) {
    delete analytical.optionalDependencies;
    fs.writeFileSync(analyticalPkgPath, `${JSON.stringify(analytical, null, 4)}\n`);
    console.log('removed optionalDependencies from @reqlan/analytical (git / workspace)');
}

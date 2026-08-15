/**
 * Local/dev publish of `@reqlan/analytical-<platform>-<arch>` packages.
 * Builds (optional), collects the napi binary, stages the package, skips
 * versions already on npm, then `npm publish --access public`.
 *
 * Requires: logged-in npm user with publish rights on `@reqlan`
 *   (npm login / npm whoami). Trusted Publisher OIDC is CI-only.
 *
 * Usage:
 *   pnpm native:publish
 *   pnpm native:publish -- --target linux-x64-gnu
 *   pnpm native:publish -- --no-build          # use existing crates/target or artifacts/napi
 *   pnpm native:publish -- --dry-run
 *   pnpm native:publish -- --all               # every target with a binary under artifacts/napi
 *   pnpm native:publish -- --force             # attempt publish even if version exists
 *
 * Default: cargo-build the host (or --target) release binary, then publish.
 * `--all` does not cross-compile; only publishes targets that already have binaries.
 *
 * rq:["../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 * rq:["../reqlan rq/distribution/distribution.rq".npm_distribution]
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

function run(command, args, cwd = root, env = process.env) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env,
    });
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
    }
}

async function versionExistsOnNpm(name, version) {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (response.status === 200) {
        return true;
    }
    if (response.status === 404) {
        return false;
    }
    const body = await response.text();
    throw new Error(`npm registry lookup failed for ${name}@${version}: HTTP ${response.status}\n${body}`);
}

const argv = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = argv.includes('--dry-run');
const force = argv.includes('--force');
const noBuild = argv.includes('--no-build');
const doBuild = argv.includes('--build') || !noBuild;
const all = argv.includes('--all');
const only = parseArg(argv, '--target');

/** @type {import('./native-targets.mjs').NativeTarget[]} */
let targets;
if (all) {
    targets = NATIVE_TARGETS;
} else if (only) {
    const t = NATIVE_TARGETS.find((x) => x.napiSuffix === only || x.vsCodeTarget === only);
    if (!t) {
        throw new Error(`Unknown --target ${only}`);
    }
    targets = [t];
} else {
    const host = hostNativeTarget();
    if (!host) {
        throw new Error(`No native target for ${process.platform}-${process.arch}`);
    }
    targets = [host];
}

const whoami = spawnSync('npm', ['whoami'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
});
if (!dryRun && whoami.status !== 0) {
    throw new Error(
        'Not logged in to npm. Run `npm login` as an @reqlan org member, then retry.\n' +
            (whoami.stderr || whoami.stdout || '')
    );
}
if (whoami.status === 0) {
    console.log(`npm user: ${(whoami.stdout || '').trim()}`);
}

let published = 0;
let skipped = 0;

const cargoTargetDir = path.join(root, 'crates/target');
const cargoEnv = { ...process.env, CARGO_TARGET_DIR: cargoTargetDir };

for (const target of targets) {
    const artifactBinary = path.join(root, 'artifacts/napi', target.napiSuffix, target.binaryName);
    const hasArtifact = fs.existsSync(artifactBinary) && fs.statSync(artifactBinary).size > 0;

    if (all && !hasArtifact && !doBuild) {
        console.log(
            `skip ${target.packageName}: no binary under artifacts/napi/${target.napiSuffix}/ ` +
                `(build on that host, or run without --all for the host target)`
        );
        skipped += 1;
        continue;
    }

    // `--all` never cross-compiles; only host / explicit --target builds by default.
    const shouldBuild = doBuild && !all;
    if (shouldBuild) {
        const host = hostNativeTarget();
        const cargoArgs = ['build', '-p', 'reqlan-napi', '--release'];
        // Host build without --target lands in target/release (simpler collect path).
        if (!host || host.napiSuffix !== target.napiSuffix) {
            cargoArgs.push('--target', target.rustTarget);
        }
        console.log(`cargo ${cargoArgs.join(' ')}`);
        run('cargo', cargoArgs, path.join(root, 'crates'), cargoEnv);
    }

    run(
        process.execPath,
        [
            path.join(root, 'scripts/collect-napi-binary.mjs'),
            '--target',
            target.napiSuffix,
            '--cargo-target-dir',
            cargoTargetDir,
        ],
        root,
        cargoEnv
    );

    run(process.execPath, [
        path.join(root, 'scripts/prepare-native-packages.mjs'),
        '--binary-dir',
        'artifacts/napi',
        '--target',
        target.napiSuffix,
    ]);
    // Keep analytical optionalDependencies as workspace:* after a targeted prepare.
    run(process.execPath, [path.join(root, 'scripts/prepare-native-packages.mjs')]);

    const pkgDir = path.join(root, 'packages/analytical-native', target.napiSuffix);
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const binary = path.join(pkgDir, pkg.main);
    if (!fs.existsSync(binary) || fs.statSync(binary).size === 0) {
        throw new Error(`Refusing to publish ${pkg.name}: missing binary ${binary}`);
    }

    if (!force) {
        let exists = false;
        try {
            exists = await versionExistsOnNpm(pkg.name, pkg.version);
        } catch (error) {
            if (dryRun) {
                console.warn(
                    `warn: could not check npm for ${pkg.name}@${pkg.version} (${error instanceof Error ? error.message : error}); continuing dry-run`
                );
            } else {
                throw error;
            }
        }
        if (exists) {
            console.log(`skip ${pkg.name}@${pkg.version}: already on npm`);
            skipped += 1;
            continue;
        }
    }

    const publishArgs = ['publish', '--access', 'public'];
    if (dryRun) {
        publishArgs.push('--dry-run');
    }
    console.log(`npm ${publishArgs.join(' ')} (${pkg.name}@${pkg.version})`);
    run('npm', publishArgs, pkgDir);
    published += 1;
}

console.log(
    `native publish done: ${published} published, ${skipped} skipped` +
        (dryRun ? ' (dry-run)' : '')
);

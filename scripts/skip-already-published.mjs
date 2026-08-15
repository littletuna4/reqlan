/**
 * CI helper for npm publish under OIDC trusted publishing.
 *
 * Modes:
 *   (default) Mark every language/analytical/cli/mcp package whose version is
 *     already on the public registry as `private: true` in the checkout only.
 *     Used with `changeset publish` to avoid the @changesets/cli + pnpm E403
 *     crash (changesets#2099). Edits are never committed.
 *   --filter <name>  Check one package; write should_publish=true|false to
 *     GITHUB_OUTPUT (when set). Does not mutate package.json.
 *     Accepts core packages or `@reqlan/analytical-<platform>` under
 *     packages/analytical-native/<suffix>/package.json.
 *
 * See https://github.com/changesets/changesets/issues/2099
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_TARGETS } from './native-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const packagePaths = [
    'packages/language/package.json',
    'packages/analytical/package.json',
    'packages/cli/package.json',
    'packages/mcp/package.json',
    ...NATIVE_TARGETS.map((t) => `packages/analytical-native/${t.napiSuffix}/package.json`),
];

function parseFilter(argv) {
    const eq = argv.find((arg) => arg.startsWith('--filter='));
    if (eq) {
        return eq.slice('--filter='.length);
    }
    const idx = argv.indexOf('--filter');
    if (idx !== -1 && argv[idx + 1]) {
        return argv[idx + 1];
    }
    return undefined;
}

async function versionExistsOnNpm(name, version) {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const response = await fetch(url, {
        headers: { accept: 'application/json' },
    });
    if (response.status === 200) {
        return true;
    }
    if (response.status === 404) {
        return false;
    }
    const body = await response.text();
    throw new Error(`npm registry lookup failed for ${name}@${version}: HTTP ${response.status}\n${body}`);
}

function writeGithubOutput(key, value) {
    const out = process.env.GITHUB_OUTPUT;
    if (!out) {
        return;
    }
    fs.appendFileSync(out, `${key}=${value}\n`);
}

const filter = parseFilter(process.argv.slice(2));

if (filter) {
    const relativePath = packagePaths.find((p) => {
        const absolute = path.join(root, p);
        if (!fs.existsSync(absolute)) {
            return false;
        }
        const pkg = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        return pkg.name === filter;
    });
    if (!relativePath) {
        throw new Error(`Unknown package filter: ${filter}`);
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    if (pkg.private === true) {
        console.log(`skip ${pkg.name}: already private`);
        writeGithubOutput('should_publish', 'false');
        process.exit(0);
    }

    const exists = await versionExistsOnNpm(pkg.name, pkg.version);
    if (exists) {
        console.log(`skip ${pkg.name}@${pkg.version}: already on npm`);
        writeGithubOutput('should_publish', 'false');
    } else {
        console.log(`publish ${pkg.name}@${pkg.version}: not on npm yet`);
        writeGithubOutput('should_publish', 'true');
    }
    process.exit(0);
}

let skipped = 0;

for (const relativePath of packagePaths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        continue;
    }
    const pkg = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

    if (pkg.private === true) {
        console.log(`skip ${pkg.name}: already private`);
        continue;
    }

    // Platform packages are published via npm publish from their directory, not changeset publish.
    if (relativePath.includes('analytical-native/')) {
        continue;
    }

    const exists = await versionExistsOnNpm(pkg.name, pkg.version);
    if (!exists) {
        console.log(`publish ${pkg.name}@${pkg.version}: not on npm yet`);
        continue;
    }

    pkg.private = true;
    fs.writeFileSync(absolutePath, `${JSON.stringify(pkg, null, 4)}\n`);
    console.log(`skip ${pkg.name}@${pkg.version}: already on npm (marked private in CI checkout)`);
    skipped += 1;
}

console.log(`Marked ${skipped} already-published package(s) private for this publish run.`);

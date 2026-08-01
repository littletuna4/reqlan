/**
 * CI-only helper for OIDC + changeset publish.
 *
 * Changesets with no NPM_TOKEN can fail to detect already-published public
 * versions and then crash on pnpm's E403 JSON (missing error.summary).
 * Mark those packages private in the checkout so changeset publish skips them.
 * Edits are never committed.
 *
 * See https://github.com/changesets/changesets/issues/2099
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const packagePaths = [
    'packages/language/package.json',
    'packages/analytical/package.json',
    'packages/cli/package.json',
];

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

let skipped = 0;

for (const relativePath of packagePaths) {
    const absolutePath = path.join(root, relativePath);
    const pkg = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

    if (pkg.private === true) {
        console.log(`skip ${pkg.name}: already private`);
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

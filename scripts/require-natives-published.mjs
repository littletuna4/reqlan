/**
 * Gate `@reqlan/analytical` npm publish until every platform package of the
 * same version is deployed.
 *
 * A name in `--ready-file` counts as deployed in this job (published or
 * already on npm). Names that are not in that file are checked on the
 * public registry.
 *
 * Usage:
 *   node scripts/require-natives-published.mjs
 *   node scripts/require-natives-published.mjs --ready-file artifacts/natives-ready.txt
 *
 * rq:["../reqlan rq/distribution/distribution.rq".npm_distribution]
 * rq:["../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NATIVE_TARGETS } from './native-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string[]} argv
 * @param {string} name
 * @returns {string | undefined}
 */
export function parseArg(argv, name) {
    const eq = argv.find((arg) => arg.startsWith(`${name}=`));
    if (eq) {
        return eq.slice(name.length + 1);
    }
    const idx = argv.indexOf(name);
    if (idx !== -1 && argv[idx + 1]) {
        return argv[idx + 1];
    }
    return undefined;
}

/**
 * @param {string | undefined} readyFile
 * @returns {Set<string>}
 */
export function readReadyNames(readyFile) {
    const names = new Set();
    if (readyFile === undefined || readyFile === '') {
        return names;
    }
    if (!fs.existsSync(readyFile)) {
        return names;
    }
    const text = fs.readFileSync(readyFile, 'utf8');
    for (const line of text.split('\n')) {
        const name = line.trim();
        if (name !== '') {
            names.add(name);
        }
    }
    return names;
}

/**
 * @param {{
 *   targets: ReadonlyArray<{ packageName: string }>,
 *   version: string,
 *   readyNames: ReadonlySet<string>,
 *   versionExists: (name: string, version: string) => Promise<boolean>,
 * }} options
 * @returns {Promise<string[]>}
 */
export async function missingNativePackages(options) {
    const missing = [];
    for (const target of options.targets) {
        if (options.readyNames.has(target.packageName)) {
            continue;
        }
        const exists = await options.versionExists(target.packageName, options.version);
        if (!exists) {
            missing.push(`${target.packageName}@${options.version}`);
        }
    }
    return missing;
}

/**
 * @param {string} name
 * @param {string} version
 * @returns {Promise<boolean>}
 */
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

/**
 * @param {{
 *   argv?: string[],
 *   version?: string,
 *   versionExists?: (name: string, version: string) => Promise<boolean>,
 * }} [options]
 * @returns {Promise<{ status: number, message: string }>}
 */
export async function requireNativesPublished(options = {}) {
    const argv = options.argv !== undefined ? options.argv : process.argv.slice(2);
    const readyFile = parseArg(argv, '--ready-file');
    const readyNames = readReadyNames(readyFile);
    let version = options.version;
    if (version === undefined) {
        const analytical = JSON.parse(
            fs.readFileSync(path.join(root, 'packages/analytical/package.json'), 'utf8')
        );
        if (
            typeof analytical !== 'object' ||
            analytical === null ||
            typeof analytical.version !== 'string' ||
            analytical.version === ''
        ) {
            throw new Error('packages/analytical/package.json is missing a version');
        }
        version = analytical.version;
    }
    const versionExists =
        options.versionExists !== undefined ? options.versionExists : versionExistsOnNpm;
    const missing = await missingNativePackages({
        targets: NATIVE_TARGETS,
        version,
        readyNames,
        versionExists,
    });
    if (missing.length > 0) {
        return {
            status: 1,
            message:
                `Refuse @reqlan/analytical@${version}: natives are not deployed.\n` +
                missing.join('\n'),
        };
    }
    return {
        status: 0,
        message: `natives ready for @reqlan/analytical@${version}`,
    };
}

function invokedDirectly() {
    const entry = process.argv[1];
    if (!entry) {
        return false;
    }
    try {
        return import.meta.url === pathToFileURL(path.resolve(entry)).href;
    } catch {
        return false;
    }
}

if (invokedDirectly()) {
    try {
        const result = await requireNativesPublished();
        if (result.status === 0) {
            console.log(result.message);
        } else {
            console.error(result.message);
        }
        process.exit(result.status);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

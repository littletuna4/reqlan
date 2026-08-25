// @ts-check
/**
 * Warn on a published install when the host `@reqlan/analytical-*` optionalDependency
 * is missing. Git checkout has no optionalDependencies, so this is a no-op there.
 *
 * rq:["../../../reqlan rq/distribution/native_host_binary.rq".published_host_native_install]
 * rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {{
 *   optionalDependencies?: Record<string, string>,
 * }} AnalyticalPackageJson
 */

/**
 * @typedef {{
 *   status: 0 | 1,
 *   skipped?: 'workspace',
 *   resolved?: string,
 *   warning?: string,
 * }} CheckHostNativeResult
 */

/**
 * @typedef {{
 *   packageJson: AnalyticalPackageJson,
 *   platform: string,
 *   arch: string,
 *   resolve: (specifier: string) => string,
 *   exists: (filePath: string) => boolean,
 * }} CheckHostNativeOptions
 */

/**
 * Keep in sync with `scripts/native-targets.mjs` and `src/native/load-native.ts`.
 * @type {Readonly<Record<string, string>>}
 */
export const HOST_NATIVE_PACKAGES = Object.freeze({
    'linux-x64': '@reqlan/analytical-linux-x64-gnu',
    'linux-arm64': '@reqlan/analytical-linux-arm64-gnu',
    'darwin-x64': '@reqlan/analytical-darwin-x64',
    'darwin-arm64': '@reqlan/analytical-darwin-arm64',
    'win32-x64': '@reqlan/analytical-win32-x64-msvc',
    'win32-arm64': '@reqlan/analytical-win32-arm64-msvc'
});

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function pathIsFile(filePath) {
    try {
        return existsSync(filePath) && statSync(filePath).isFile();
    } catch {
        return false;
    }
}

/**
 * Recovery text for a missing host native (all-platform or no-native pnpm installs).
 * @param {string} packageName
 * @param {string} platform
 * @param {string} arch
 * @returns {string}
 */
export function hostNativeInstallHelp(packageName, platform, arch) {
    return [
        `Warning: native analytical engine is required but ${packageName} did not install.`,
        '',
        `This package is an optionalDependency for ${platform}-${arch}.`,
        'A package manager skips it when optional dependencies are disabled, or when',
        'supportedArchitectures does not include this machine.',
        '',
        'Install only the host binary. Do not keep every platform package. Do not keep none.',
        '',
        '1. Enable optional dependencies:',
        '   pnpm config get optional',
        '   The value must not be false. Remove --no-optional, optional=false, and omit=optional.',
        '   Remove ignoredOptionalDependencies globs that match @reqlan/analytical-*.',
        '',
        '2. Limit optional natives to this machine. Do not use --force.',
        '   --force installs every optional platform package.',
        '   Unset supportedArchitectures lists that include other OS or CPU values.',
        '   pnpm 10.14+ can pin the host:',
        `     pnpm add -g @reqlan/cli --os ${platform} --cpu ${arch}`,
        '   Or in pnpm config (pnpm-workspace.yaml or the global config.yaml):',
        '     supportedArchitectures:',
        '       os: [current]',
        '       cpu: [current]',
        '       libc: [current]',
        '',
        '3. Reinstall without --force and without --ignore-scripts:',
        '   pnpm remove -g @reqlan/cli',
        `   pnpm add -g @reqlan/cli --os ${platform} --cpu ${arch}`,
        '',
        'pnpm 10+ must allow the @reqlan/analytical build script if it prompts.',
        'See the @reqlan/cli README section "Native engine".'
    ].join('\n');
}

/**
 * @param {string} platform
 * @param {string} arch
 * @returns {string}
 */
function unsupportedHostMessage(platform, arch) {
    const supported = Object.keys(HOST_NATIVE_PACKAGES).join(', ');
    return [
        `Warning: native analytical engine is required but ${platform}-${arch} is not a supported host.`,
        `Supported: ${supported}.`
    ].join('\n');
}

/**
 * @param {CheckHostNativeOptions} options
 * @returns {CheckHostNativeResult}
 */
export function checkHostNative(options) {
    const optional = options.packageJson.optionalDependencies;
    if (optional === undefined || Object.keys(optional).length === 0) {
        return { status: 0, skipped: 'workspace' };
    }

    const packageName = HOST_NATIVE_PACKAGES[`${options.platform}-${options.arch}`];
    if (packageName === undefined) {
        return { status: 0, warning: unsupportedHostMessage(options.platform, options.arch) };
    }

    if (!(packageName in optional)) {
        return {
            status: 0,
            warning: hostNativeInstallHelp(packageName, options.platform, options.arch)
        };
    }

    try {
        const resolved = options.resolve(packageName);
        if (!options.exists(resolved)) {
            return {
                status: 0,
                warning: hostNativeInstallHelp(packageName, options.platform, options.arch)
            };
        }
        return { status: 0, resolved };
    } catch {
        return {
            status: 0,
            warning: hostNativeInstallHelp(packageName, options.platform, options.arch)
        };
    }
}

/**
 * @param {unknown} value
 * @param {string} pkgPath
 * @returns {AnalyticalPackageJson}
 */
function parseAnalyticalPackageJson(value, pkgPath) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`Invalid package.json at ${pkgPath}`);
    }
    if (!('optionalDependencies' in value) || value.optionalDependencies === undefined) {
        return {};
    }
    const optional = value.optionalDependencies;
    if (typeof optional !== 'object' || optional === null || Array.isArray(optional)) {
        throw new Error(`optionalDependencies must be an object in ${pkgPath}`);
    }
    /** @type {Record<string, string>} */
    const optionalDependencies = {};
    for (const [name, version] of Object.entries(optional)) {
        if (typeof version !== 'string') {
            throw new Error(`optionalDependencies[${name}] must be a string in ${pkgPath}`);
        }
        optionalDependencies[name] = version;
    }
    return { optionalDependencies };
}

/**
 * @param {string} packageRoot
 * @param {{ platform?: string, arch?: string }} [overrides]
 * @returns {CheckHostNativeResult}
 */
export function runCheckHostNativeFromPackageRoot(packageRoot, overrides = {}) {
    const pkgPath = join(packageRoot, 'package.json');
    const packageJson = parseAnalyticalPackageJson(
        JSON.parse(readFileSync(pkgPath, 'utf8')),
        pkgPath
    );
    const requireFromPkg = createRequire(pkgPath);
    return checkHostNative({
        packageJson,
        platform: overrides.platform ?? process.platform,
        arch: overrides.arch ?? process.arch,
        resolve: specifier => requireFromPkg.resolve(specifier),
        exists: pathIsFile
    });
}

function isMainModule() {
    const entry = process.argv[1];
    if (typeof entry !== 'string') {
        return false;
    }
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(entry));
    } catch {
        return fileURLToPath(import.meta.url) === resolve(entry);
    }
}

if (isMainModule()) {
    const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    const result = runCheckHostNativeFromPackageRoot(packageRoot);
    if (result.warning !== undefined) {
        console.warn(result.warning);
    }
    process.exit(result.status);
}

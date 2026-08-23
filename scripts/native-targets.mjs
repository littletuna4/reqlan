/**
 * Shared native target matrix for npm platform packages and VSIX --target.
 * rq:["../reqlan rq/distribution/distribution.rq".native_targets]
 * rq:["../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 */

/** @typedef {{
 *   vsCodeTarget: string,
 *   napiSuffix: string,
 *   packageName: string,
 *   os: string[],
 *   cpu: string[],
 *   rustTarget: string,
 *   binaryName: string,
 *   ciImage: string,
 * }} NativeTarget */

/** @type {NativeTarget[]} */
export const NATIVE_TARGETS = [
    {
        vsCodeTarget: 'win32-x64',
        napiSuffix: 'win32-x64-msvc',
        packageName: '@reqlan/analytical-win32-x64-msvc',
        os: ['win32'],
        cpu: ['x64'],
        rustTarget: 'x86_64-pc-windows-msvc',
        binaryName: 'reqlan_napi.win32-x64-msvc.node',
        ciImage: 'windows-latest',
    },
    {
        vsCodeTarget: 'win32-arm64',
        napiSuffix: 'win32-arm64-msvc',
        packageName: '@reqlan/analytical-win32-arm64-msvc',
        os: ['win32'],
        cpu: ['arm64'],
        rustTarget: 'aarch64-pc-windows-msvc',
        binaryName: 'reqlan_napi.win32-arm64-msvc.node',
        ciImage: 'windows-latest',
    },
    {
        vsCodeTarget: 'linux-x64',
        napiSuffix: 'linux-x64-gnu',
        packageName: '@reqlan/analytical-linux-x64-gnu',
        os: ['linux'],
        cpu: ['x64'],
        rustTarget: 'x86_64-unknown-linux-gnu',
        binaryName: 'reqlan_napi.linux-x64-gnu.node',
        ciImage: 'ubuntu-latest',
    },
    {
        vsCodeTarget: 'linux-arm64',
        napiSuffix: 'linux-arm64-gnu',
        packageName: '@reqlan/analytical-linux-arm64-gnu',
        os: ['linux'],
        cpu: ['arm64'],
        rustTarget: 'aarch64-unknown-linux-gnu',
        binaryName: 'reqlan_napi.linux-arm64-gnu.node',
        ciImage: 'ubuntu-latest',
    },
    {
        vsCodeTarget: 'darwin-x64',
        napiSuffix: 'darwin-x64',
        packageName: '@reqlan/analytical-darwin-x64',
        os: ['darwin'],
        cpu: ['x64'],
        rustTarget: 'x86_64-apple-darwin',
        binaryName: 'reqlan_napi.darwin-x64.node',
        ciImage: 'macOS-latest',
    },
    {
        vsCodeTarget: 'darwin-arm64',
        napiSuffix: 'darwin-arm64',
        packageName: '@reqlan/analytical-darwin-arm64',
        os: ['darwin'],
        cpu: ['arm64'],
        rustTarget: 'aarch64-apple-darwin',
        binaryName: 'reqlan_napi.darwin-arm64.node',
        ciImage: 'macOS-latest',
    },
];

/**
 * Resolve the napi package for the current Node process host.
 * @param {string} [platform]
 * @param {string} [arch]
 * @returns {NativeTarget | undefined}
 */
export function hostNativeTarget(platform = process.platform, arch = process.arch) {
    return NATIVE_TARGETS.find((t) => t.os.includes(platform) && t.cpu.includes(arch));
}

/**
 * Workspace install map for `@reqlan/analytical` optionalDependencies.
 * Applied by pnpm `packageExtensions` in `pnpm-workspace.yaml` (dev/CI).
 * Not written into git `packages/analytical/package.json` so Changesets can
 * ignore natives.
 * @returns {Record<string, 'workspace:*'>}
 */
export function workspaceNativeOptionalDependencies() {
    /** @type {Record<string, 'workspace:*'>} */
    const deps = {};
    for (const target of NATIVE_TARGETS) {
        deps[target.packageName] = 'workspace:*';
    }
    return deps;
}

/**
 * @param {string} vsCodeTarget
 * @returns {NativeTarget | undefined}
 */
export function targetByVsCode(vsCodeTarget) {
    return NATIVE_TARGETS.find((t) => t.vsCodeTarget === vsCodeTarget);
}

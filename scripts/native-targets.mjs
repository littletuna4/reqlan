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
    },
    {
        vsCodeTarget: 'win32-arm64',
        napiSuffix: 'win32-arm64-msvc',
        packageName: '@reqlan/analytical-win32-arm64-msvc',
        os: ['win32'],
        cpu: ['arm64'],
        rustTarget: 'aarch64-pc-windows-msvc',
        binaryName: 'reqlan_napi.win32-arm64-msvc.node',
    },
    {
        vsCodeTarget: 'linux-x64',
        napiSuffix: 'linux-x64-gnu',
        packageName: '@reqlan/analytical-linux-x64-gnu',
        os: ['linux'],
        cpu: ['x64'],
        rustTarget: 'x86_64-unknown-linux-gnu',
        binaryName: 'reqlan_napi.linux-x64-gnu.node',
    },
    {
        vsCodeTarget: 'linux-arm64',
        napiSuffix: 'linux-arm64-gnu',
        packageName: '@reqlan/analytical-linux-arm64-gnu',
        os: ['linux'],
        cpu: ['arm64'],
        rustTarget: 'aarch64-unknown-linux-gnu',
        binaryName: 'reqlan_napi.linux-arm64-gnu.node',
    },
    {
        vsCodeTarget: 'darwin-x64',
        napiSuffix: 'darwin-x64',
        packageName: '@reqlan/analytical-darwin-x64',
        os: ['darwin'],
        cpu: ['x64'],
        rustTarget: 'x86_64-apple-darwin',
        binaryName: 'reqlan_napi.darwin-x64.node',
    },
    {
        vsCodeTarget: 'darwin-arm64',
        napiSuffix: 'darwin-arm64',
        packageName: '@reqlan/analytical-darwin-arm64',
        os: ['darwin'],
        cpu: ['arm64'],
        rustTarget: 'aarch64-apple-darwin',
        binaryName: 'reqlan_napi.darwin-arm64.node',
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
 * @param {string} vsCodeTarget
 * @returns {NativeTarget | undefined}
 */
export function targetByVsCode(vsCodeTarget) {
    return NATIVE_TARGETS.find((t) => t.vsCodeTarget === vsCodeTarget);
}

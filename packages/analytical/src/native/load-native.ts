/**
 * Native engine feature flag and napi-rs loader.
 * rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 * rq:["../../../reqlan rq/distribution/distribution.rq".extension_host_target]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NativeSqlDbHandle } from './native-sql-db.js';
import type { NativeWorkspaceIndexHandle } from './native-workspace-index.js';

/**
 * Directory of this module (or of the CJS bundle that inlined it).
 * Prefer `__dirname` in the extension host CJS bundle. Under Node ESM, use
 * `import.meta.url` — do not eval that expression; Node 24 treats a script eval
 * as `Cannot use 'import.meta' outside a module`.
 * rq:["../../../reqlan rq/extension/startup-performance.rq".invalid_url_activation_failure]
 */
declare const __dirname: string | undefined;
declare const __filename: string | undefined;

function moduleDirectory(): string {
    if (typeof __dirname === 'string') {
        return __dirname;
    }
    return dirname(fileURLToPath(import.meta.url));
}

/**
 * `@reqlan/analytical/package.json` — the same place npm/pnpm attach
 * `optionalDependencies` for a published install. Walking from this compiled
 * file (or a CJS bundle) can miss that graph; the extension VSIX has no
 * analytical package.json and falls back to `__filename` / `import.meta.url`.
 */
function analyticalPackageJsonPath(): string | undefined {
    let dir = moduleDirectory();
    for (let i = 0; i < 12; i++) {
        const pkgPath = join(dir, 'package.json');
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
                if (pkg.name === '@reqlan/analytical') {
                    return pkgPath;
                }
            } catch {
                // ignore unreadable package.json
            }
        }
        const parent = dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return undefined;
}

function nativeRequire(): ReturnType<typeof createRequire> {
    const analyticalPkg = analyticalPackageJsonPath();
    if (analyticalPkg) {
        return createRequire(analyticalPkg);
    }
    if (typeof __filename === 'string') {
        return createRequire(__filename);
    }
    return createRequire(import.meta.url);
}

/** Extra directories to search for a staged `reqlan_napi.node` (e.g. extension VSIX `native/`). */
const extraSearchDirs: string[] = [];

export interface NativeAnalysisRuntimeHandle {
    ensureReady(): void;
    searchRequirements(query: string, limit: number, context?: string[]): unknown;
    listRequirements(limit: number): unknown;
    getFileContext(filePath: string): unknown;
    getLocalGraph(filePath: string, depth: number): unknown;
    summarizeSubtree(requirementName: string, depth: number): unknown;
    getCompletionStatus(): unknown;
    getDeprecationImpact(): unknown;
    exportGraph(request: unknown): unknown;
    resolveRequirementReference(name?: string): unknown;
    resolveFileReference(pathPrefix?: string): unknown;
}

export interface NativeModule {
    NativeAnalysisRuntime: {
        open(workspaceRoot: string, storagePath?: string): NativeAnalysisRuntimeHandle;
    };
    NativeSqlDb: {
        open(path: string): NativeSqlDbHandle;
    };
    NativeWorkspaceIndex: {
        open(workspaceRoot: string, storagePath?: string): NativeWorkspaceIndexHandle;
    };
    /** Single-file parse; present on core engine builds with CLI parse. */
    parseReqlanSource?(source: string): unknown;
    /** Top-level idea names in a document (git-context historical extract). */
    extractIdeaNames?(source: string): string[];
    /** Barrel-page plan from source text (no filesystem writes). */
    barrelPagePlan?(source: string, containerName: string | undefined, sourceFileName: string): unknown;
    /** Seed a reqlan base marker (`.reqlan/` + `config.json` + `.rqignore`). */
    createBase?(baseRoot: string): unknown;
}

/** null = not probed yet; undefined = probed, missing; NativeModule = loaded */
let cachedEngine: NativeModule | undefined | null = null;

/**
 * Register directories that may contain a staged host-matching `reqlan_napi.node`
 * (used by the VS Code extension after per-target VSIX packaging).
 */
export function addNativeEngineSearchDirs(...dirs: string[]): void {
    for (const dir of dirs) {
        if (dir && !extraSearchDirs.includes(dir)) {
            extraSearchDirs.push(dir);
        }
    }
    cachedEngine = null;
}

function loadCached(): NativeModule | undefined {
    if (cachedEngine === null) {
        cachedEngine = tryLoadNativeEngineUncached();
    }
    return cachedEngine;
}

/**
 * Native engine is required. Env overrides that forced the old JS/sql.js path
 * are rejected so production always uses the host core engine.
 */
export function nativeEngineRequested(): boolean {
    const value = process.env.REQLAN_ANALYTICAL_ENGINE?.trim().toLowerCase();
    if (value === 'js' || value === 'typescript' || value === 'sqljs') {
        throw new Error(
            `REQLAN_ANALYTICAL_ENGINE=${value} is no longer supported; the native engine is required.`
        );
    }
    return true;
}

/**
 * Host napi tuples keyed by Node `process.platform`-`process.arch` (extension host,
 * not the VS Code UI client). Keep in sync with `scripts/native-targets.mjs`.
 */
export interface HostNativeBindingSpec {
    vsCodeTarget: string;
    napiSuffix: string;
    packageName: string;
    binaryName: string;
    rustTarget: string;
}

const HOST_NATIVE_BY_PLATFORM: Record<string, HostNativeBindingSpec> = {
    'linux-x64': {
        vsCodeTarget: 'linux-x64',
        napiSuffix: 'linux-x64-gnu',
        packageName: '@reqlan/analytical-linux-x64-gnu',
        binaryName: 'reqlan_napi.linux-x64-gnu.node',
        rustTarget: 'x86_64-unknown-linux-gnu'
    },
    'linux-arm64': {
        vsCodeTarget: 'linux-arm64',
        napiSuffix: 'linux-arm64-gnu',
        packageName: '@reqlan/analytical-linux-arm64-gnu',
        binaryName: 'reqlan_napi.linux-arm64-gnu.node',
        rustTarget: 'aarch64-unknown-linux-gnu'
    },
    'darwin-x64': {
        vsCodeTarget: 'darwin-x64',
        napiSuffix: 'darwin-x64',
        packageName: '@reqlan/analytical-darwin-x64',
        binaryName: 'reqlan_napi.darwin-x64.node',
        rustTarget: 'x86_64-apple-darwin'
    },
    'darwin-arm64': {
        vsCodeTarget: 'darwin-arm64',
        napiSuffix: 'darwin-arm64',
        packageName: '@reqlan/analytical-darwin-arm64',
        binaryName: 'reqlan_napi.darwin-arm64.node',
        rustTarget: 'aarch64-apple-darwin'
    },
    'win32-x64': {
        vsCodeTarget: 'win32-x64',
        napiSuffix: 'win32-x64-msvc',
        packageName: '@reqlan/analytical-win32-x64-msvc',
        binaryName: 'reqlan_napi.win32-x64-msvc.node',
        rustTarget: 'x86_64-pc-windows-msvc'
    },
    'win32-arm64': {
        vsCodeTarget: 'win32-arm64',
        napiSuffix: 'win32-arm64-msvc',
        packageName: '@reqlan/analytical-win32-arm64-msvc',
        binaryName: 'reqlan_napi.win32-arm64-msvc.node',
        rustTarget: 'aarch64-pc-windows-msvc'
    }
};

/** Resolve the napi package for this Node / extension-host process. */
export function hostNativeBindingSpec(
    platform = process.platform,
    arch = process.arch
): HostNativeBindingSpec | undefined {
    return HOST_NATIVE_BY_PLATFORM[`${platform}-${arch}`];
}

const CRATE_BINARY_NAMES = [
    'reqlan_napi.node',
    'libreqlan_napi.so',
    'libreqlan_napi.dylib',
    'reqlan_napi.dll'
];

/**
 * Walk toward the repo root looking for `crates/Cargo.toml`.
 * Compiled output lives in `packages/analytical/out/native/` (four levels below
 * the repo root); a naive `../../../crates` incorrectly resolves to `packages/crates`.
 */
function findRepoRoot(start: string): string | undefined {
    let dir = start;
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, 'crates', 'Cargo.toml'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return undefined;
}

function crateBuildCandidates(repoRoot: string, rustTarget: string): string[] {
    const targetRoot = join(repoRoot, 'crates', 'target');
    const dirs = [
        join(targetRoot, rustTarget, 'release'),
        join(targetRoot, 'release'),
        join(targetRoot, rustTarget, 'debug'),
        join(targetRoot, 'debug')
    ];
    return dirs.flatMap(dir => CRATE_BINARY_NAMES.map(name => join(dir, name)));
}

function hostNativePackageFile(repoRoot: string, spec: HostNativeBindingSpec): string {
    return join(repoRoot, 'packages', 'analytical-native', spec.napiSuffix, spec.binaryName);
}

/** Absolute `main` of the host optionalDependency, when Node can resolve it. */
function resolvedHostPackageMain(spec: HostNativeBindingSpec): string | undefined {
    try {
        return nativeRequire().resolve(spec.packageName);
    } catch {
        return undefined;
    }
}

function readStagedTarget(dir: string): string | undefined {
    const metaPath = join(dir, 'target.json');
    if (!existsSync(metaPath)) {
        return undefined;
    }
    try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { vsCodeTarget?: string };
        return typeof meta.vsCodeTarget === 'string' ? meta.vsCodeTarget : undefined;
    } catch {
        return undefined;
    }
}

function stagedDirCandidates(dir: string, spec: HostNativeBindingSpec): string[] {
    const stagedTarget = readStagedTarget(dir);
    const hostNamed = join(dir, spec.binaryName);
    const generic = join(dir, 'reqlan_napi.node');
    const crateNames = [
        join(dir, 'libreqlan_napi.so'),
        join(dir, 'libreqlan_napi.dylib'),
        join(dir, 'reqlan_napi.dll')
    ];
    if (stagedTarget && stagedTarget !== spec.vsCodeTarget) {
        return [hostNamed];
    }
    return [hostNamed, generic, ...crateNames];
}

/** Filesystem paths and the host npm package name probed for this process. */
export function listNativeEngineCandidates(
    platform = process.platform,
    arch = process.arch
): string[] {
    const spec = hostNativeBindingSpec(platform, arch);
    if (!spec) {
        return [];
    }
    const here = moduleDirectory();
    const repoRoot = findRepoRoot(here);
    const staged = extraSearchDirs.flatMap(dir => stagedDirCandidates(dir, spec));
    const stagedHostPkg = repoRoot ? hostNativePackageFile(repoRoot, spec) : undefined;
    const resolvedPkg = resolvedHostPackageMain(spec);

    return [
        ...staged,
        ...(resolvedPkg ? [resolvedPkg] : []),
        ...(stagedHostPkg ? [stagedHostPkg] : []),
        spec.packageName,
        ...(repoRoot ? crateBuildCandidates(repoRoot, spec.rustTarget) : [])
    ].filter((c, i, arr) => arr.indexOf(c) === i);
}

function candidatePaths(): string[] {
    return listNativeEngineCandidates();
}

function tryRequire(candidate: string): NativeModule | undefined {
    // Skip known-missing filesystem paths without attempting require.
    if (!candidate.startsWith('@') && !existsSync(candidate)) {
        return undefined;
    }
    try {
        return nativeRequire()(candidate) as NativeModule;
    } catch {
        return undefined;
    }
}

/** Load the host-matching core engine `.node`, or `undefined` when unavailable. */
function tryLoadNativeEngineUncached(): NativeModule | undefined {
    for (const candidate of candidatePaths()) {
        const loaded = tryRequire(candidate);
        if (loaded?.NativeAnalysisRuntime && loaded?.NativeSqlDb && loaded?.NativeWorkspaceIndex) {
            return loaded;
        }
    }
    return undefined;
}

/** Load the host-matching core engine `.node`, or `undefined` when unavailable. */
export function tryLoadNativeEngine(): NativeModule | undefined {
    return loadCached();
}

export function loadNativeEngine(): NativeModule {
    const loaded = loadCached();
    if (loaded) {
        return loaded;
    }
    const spec = hostNativeBindingSpec();
    if (!spec) {
        const supported = Object.keys(HOST_NATIVE_BY_PLATFORM).join(', ');
        throw new Error(
            `Native analytical engine is required but ${process.platform}-${process.arch} ` +
                `is not a supported extension-host target. Supported: ${supported}.`
        );
    }
    const tried = candidatePaths().join('\n');
    throw new Error(
        `Native analytical engine is required but the host .node was not found ` +
            `(${spec.vsCodeTarget} / ${spec.packageName}). ` +
            `Build crates/reqlan-napi (cargo build -p reqlan-napi) or install the host ` +
            `optionalDependency package. Tried:\n${tried}`
    );
}

export function nativeEngineAvailable(): boolean {
    return loadCached() !== undefined;
}

/** Clear the load cache (tests / after registering new search dirs). */
export function resetNativeEngineCache(): void {
    cachedEngine = null;
}

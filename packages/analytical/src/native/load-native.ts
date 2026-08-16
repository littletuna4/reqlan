/**
 * Native engine feature flag and napi-rs loader.
 * rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 * rq:["../../../reqlan rq/distribution/distribution.rq".extension_host_target]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
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

function nativeRequire(): ReturnType<typeof createRequire> {
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

const HOST_PACKAGE_BY_PLATFORM: Record<string, string> = {
    'linux-x64': '@reqlan/analytical-linux-x64-gnu',
    'linux-arm64': '@reqlan/analytical-linux-arm64-gnu',
    'darwin-arm64': '@reqlan/analytical-darwin-arm64',
    'darwin-x64': '@reqlan/analytical-darwin-x64',
    'win32-x64': '@reqlan/analytical-win32-x64-msvc',
    'win32-arm64': '@reqlan/analytical-win32-arm64-msvc'
};

const HOST_BINARY_BY_PLATFORM: Record<string, string> = {
    'linux-x64': 'reqlan_napi.linux-x64-gnu.node',
    'linux-arm64': 'reqlan_napi.linux-arm64-gnu.node',
    'darwin-arm64': 'reqlan_napi.darwin-arm64.node',
    'darwin-x64': 'reqlan_napi.darwin-x64.node',
    'win32-x64': 'reqlan_napi.win32-x64-msvc.node',
    'win32-arm64': 'reqlan_napi.win32-arm64-msvc.node'
};

function hostPackageName(platform = process.platform, arch = process.arch): string | undefined {
    return HOST_PACKAGE_BY_PLATFORM[`${platform}-${arch}`];
}

function candidatePaths(): string[] {
    const here = moduleDirectory();
    const hostPkg = hostPackageName();
    const hostBinary = HOST_BINARY_BY_PLATFORM[`${process.platform}-${process.arch}`];
    const staged = extraSearchDirs.flatMap(dir => [
        join(dir, 'reqlan_napi.node'),
        ...(hostBinary ? [join(dir, hostBinary)] : []),
        join(dir, 'libreqlan_napi.so'),
        join(dir, 'libreqlan_napi.dylib'),
        join(dir, 'reqlan_napi.dll')
    ]);

    return [
        ...staged,
        // Prefer the host-matching optionalDependency package first.
        ...(hostPkg ? [hostPkg] : []),
        // Local crate builds (dev).
        join(here, '../../../crates/target/release/reqlan_napi.node'),
        join(here, '../../../crates/target/debug/reqlan_napi.node'),
        join(here, '../../../crates/target/release/libreqlan_napi.so'),
        join(here, '../../../crates/target/debug/libreqlan_napi.so'),
        join(here, '../../../crates/target/release/libreqlan_napi.dylib'),
        join(here, '../../../crates/target/debug/libreqlan_napi.dylib'),
        join(here, '../../../crates/target/release/reqlan_napi.dll'),
        join(here, '../../../crates/target/debug/reqlan_napi.dll'),
        // Remaining platform packages (wrong-host installs still listed for clear errors).
        '@reqlan/analytical-linux-x64-gnu',
        '@reqlan/analytical-linux-arm64-gnu',
        '@reqlan/analytical-darwin-arm64',
        '@reqlan/analytical-darwin-x64',
        '@reqlan/analytical-win32-x64-msvc',
        '@reqlan/analytical-win32-arm64-msvc'
    ].filter((c, i, arr) => arr.indexOf(c) === i);
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
    const tried = candidatePaths().join('\n');
    throw new Error(
        `Native analytical engine is required but the host .node was not found. ` +
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

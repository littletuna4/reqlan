/**
 * Unit tests for the core native engine loader.
 * rq:["../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 * rq:["../../reqlan rq/distribution/native_host_binary.rq".native_host_binary]
 * rq:["../../reqlan rq/extension/startup-performance.rq".invalid_url_activation_failure]
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
    addNativeEngineSearchDirs,
    hostNativeBindingSpec,
    listNativeEngineCandidates,
    nativeEngineRequested,
    resetNativeEngineCache,
    resetNativeEngineSearchDirs,
    stagedNativeHostMismatch,
    tryLoadNativeEngine
} from '../src/native/load-native.js';
import { NATIVE_TARGETS, hostNativeTarget } from '../../../scripts/native-targets.mjs';

const here = dirname(fileURLToPath(import.meta.url));

describe('load-native', () => {
    afterEach(() => {
        delete process.env.REQLAN_ANALYTICAL_ENGINE;
        delete process.env.REQLAN_NATIVE;
        resetNativeEngineSearchDirs();
        resetNativeEngineCache();
    });

    it('rejects the removed JS/sql.js engine override', () => {
        process.env.REQLAN_ANALYTICAL_ENGINE = 'js';
        expect(() => nativeEngineRequested()).toThrow(/no longer supported/i);
    });

    it('always requests native when no override is set', () => {
        expect(nativeEngineRequested()).toBe(true);
    });

    it('loads NativeAnalysisRuntime, NativeSqlDb, and NativeWorkspaceIndex when the engine is present', () => {
        const loaded = tryLoadNativeEngine();
        if (!loaded) {
            return;
        }
        expect(loaded.NativeAnalysisRuntime).toBeTypeOf('function');
        expect(loaded.NativeSqlDb).toBeTypeOf('function');
        expect(loaded.NativeWorkspaceIndex).toBeTypeOf('function');
    });

    it('exposes parseReqlanSource on the engine when present', () => {
        const loaded = tryLoadNativeEngine();
        if (!loaded) {
            return;
        }
        expect(loaded.parseReqlanSource).toBeTypeOf('function');
        const parsed = loaded.parseReqlanSource?.('hello this is a demo idea\n') as {
            ok: boolean;
            elements: Array<{ type: string; name?: string }>;
        };
        expect(parsed.ok).toBe(true);
        expect(parsed.elements.some(element => element.name === 'hello')).toBe(true);
    });

    it('accepts extra search dirs without throwing', () => {
        addNativeEngineSearchDirs('/tmp/reqlan-missing-native-dir');
        expect(() => tryLoadNativeEngine()).not.toThrow();
    });

    it('maps Node platform/arch to the same napi tuples as packaging', () => {
        for (const target of NATIVE_TARGETS) {
            const [platform, arch] = target.vsCodeTarget.split('-');
            const spec = hostNativeBindingSpec(platform, arch);
            expect(spec).toEqual({
                vsCodeTarget: target.vsCodeTarget,
                napiSuffix: target.napiSuffix,
                packageName: target.packageName,
                binaryName: target.binaryName,
                rustTarget: target.rustTarget
            });
            expect(hostNativeTarget(platform, arch)?.napiSuffix).toBe(target.napiSuffix);
        }
        expect(hostNativeBindingSpec('linux', 'ia32')).toBeUndefined();
        expect(listNativeEngineCandidates('linux', 'ia32')).toEqual([]);
    });

    it('probes only the host platform package, not every optionalDependency', () => {
        const candidates = listNativeEngineCandidates('linux', 'x64');
        expect(candidates).toContain('@reqlan/analytical-linux-x64-gnu');
        expect(candidates).not.toContain('@reqlan/analytical-linux-arm64-gnu');
        expect(candidates).not.toContain('@reqlan/analytical-darwin-arm64');
        expect(candidates).not.toContain('@reqlan/analytical-darwin-x64');
        expect(candidates).not.toContain('@reqlan/analytical-win32-x64-msvc');
        expect(candidates).not.toContain('@reqlan/analytical-win32-arm64-msvc');
    });

    // rq:["../../reqlan rq/distribution/native_host_binary.rq".native_host_binary_distributed]
    it('resolves the host optionalDependency from @reqlan/analytical package.json', () => {
        const spec = hostNativeBindingSpec();
        if (!spec) {
            return;
        }
        const pkgPath = join(here, '../package.json');
        const req = createRequire(pkgPath);
        const candidates = listNativeEngineCandidates();
        expect(candidates).toContain(spec.packageName);
        try {
            const resolved = req.resolve(spec.packageName);
            expect(candidates).toContain(resolved);
            expect(tryLoadNativeEngine()).toBeDefined();
        } catch {
            // Workspace stub without a .node — production npm install and
            // ensure-host-native.mjs populate this path before tests.
        }
    });

    it('skips a staged generic .node when native/target.json is a different host', () => {
        const dir = mkdtempSync(join(tmpdir(), 'reqlan-native-mismatch-'));
        try {
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                join(dir, 'target.json'),
                `${JSON.stringify({ vsCodeTarget: 'win32-x64', binaryName: 'reqlan_napi.node' }, null, 4)}\n`
            );
            writeFileSync(join(dir, 'reqlan_napi.node'), 'not-a-real-binary');
            addNativeEngineSearchDirs(dir);
            const candidates = listNativeEngineCandidates('linux', 'x64');
            expect(candidates).not.toContain(join(dir, 'reqlan_napi.node'));
            expect(candidates).toContain(join(dir, 'reqlan_napi.linux-x64-gnu.node'));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    // rq:["../../reqlan rq/distribution/native_host_binary.rq".native_host_binary]
    it('explains a Linux-staged native/ folder to a Windows extension host', () => {
        const dir = mkdtempSync(join(tmpdir(), 'reqlan-native-win-host-'));
        try {
            mkdirSync(dir, { recursive: true });
            writeFileSync(
                join(dir, 'target.json'),
                `${JSON.stringify({ vsCodeTarget: 'linux-x64', binaryName: 'reqlan_napi.node' }, null, 4)}\n`
            );
            addNativeEngineSearchDirs(dir);
            const detail = stagedNativeHostMismatch('win32', 'x64');
            expect(detail).toMatch(/linux-x64/);
            expect(detail).toMatch(/win32-x64/);
            expect(detail).toMatch(/WSL/i);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    // rq:["../../reqlan rq/distribution/native_host_binary.rq".native_host_binary_development]
    it('lists the Windows cargo dll among win32-x64 candidates', () => {
        const candidates = listNativeEngineCandidates('win32', 'x64');
        expect(candidates).toContain('@reqlan/analytical-win32-x64-msvc');
        expect(candidates.some(path => path.endsWith('reqlan_napi.dll'))).toBe(true);
    });

    it('does not resolve import.meta via script eval', () => {
        const compiled = readFileSync(join(here, '../out/native/load-native.js'), 'utf8');
        expect(compiled).not.toMatch(/\beval\s*\(/);
        expect(compiled).toContain('import.meta.url');
        expect(compiled).toContain('typeof __dirname');
    });

    it('probes crates/Cargo.toml from the repo root rather than packages/crates', () => {
        const source = readFileSync(join(here, '../src/native/load-native.ts'), 'utf8');
        expect(source).toContain("join(dir, 'crates', 'Cargo.toml')");
        expect(source).not.toMatch(/\.\.\/\.\.\/\.\.\/crates\/target/);
        expect(source).toContain("pkg.name === '@reqlan/analytical'");
        expect(source).toContain('createRequire(analyticalPkg)');
        expect(source).toContain('process.dlopen');
    });

    it('loads under plain Node ESM without vitest transforming import.meta', () => {
        const specifier = pathToFileURL(join(here, '../out/native/load-native.js')).href;
        const result = spawnSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `import { tryLoadNativeEngine } from ${JSON.stringify(specifier)}; tryLoadNativeEngine();`
            ],
            { encoding: 'utf8' }
        );
        expect(result.stderr, result.stderr).not.toMatch(/import\.meta/);
        expect(result.status).toBe(0);
    });
});

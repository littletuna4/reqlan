/**
 * Unit tests for the core native engine loader.
 * rq:["../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 * rq:["../../reqlan rq/extension/startup-performance.rq".invalid_url_activation_failure]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
    addNativeEngineSearchDirs,
    nativeEngineRequested,
    resetNativeEngineCache,
    tryLoadNativeEngine
} from '../src/native/load-native.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('load-native', () => {
    afterEach(() => {
        delete process.env.REQLAN_ANALYTICAL_ENGINE;
        delete process.env.REQLAN_NATIVE;
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

    it('does not resolve import.meta via script eval', () => {
        const compiled = readFileSync(join(here, '../out/native/load-native.js'), 'utf8');
        expect(compiled).not.toMatch(/\beval\s*\(/);
        expect(compiled).toContain('import.meta.url');
        expect(compiled).toContain('typeof __dirname');
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

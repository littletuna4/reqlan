/**
 * Platform package + VSIX target layout for the first native release.
 * rq:["../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { NATIVE_TARGETS, hostNativeTarget } from '../../../scripts/native-targets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('native platform packaging', () => {
    test('defines the six host targets with os/cpu and napi suffixes', () => {
        expect(NATIVE_TARGETS.map(target => target.vsCodeTarget)).toEqual([
            'win32-x64',
            'win32-arm64',
            'linux-x64',
            'linux-arm64',
            'darwin-x64',
            'darwin-arm64'
        ]);
        for (const target of NATIVE_TARGETS) {
            expect(target.packageName).toBe(`@reqlan/analytical-${target.napiSuffix}`);
            expect(target.os.length).toBeGreaterThan(0);
            expect(target.cpu.length).toBeGreaterThan(0);
            expect(target.binaryName).toMatch(/\.node$/);
        }
        expect(hostNativeTarget('linux', 'x64')?.napiSuffix).toBe('linux-x64-gnu');
    });

    test('@reqlan/analytical optionalDependencies list every platform package', () => {
        const analytical = JSON.parse(
            readFileSync(join(root, 'packages/analytical/package.json'), 'utf8')
        ) as {
            version: string;
            optionalDependencies: Record<string, string>;
        };
        for (const target of NATIVE_TARGETS) {
            const spec = analytical.optionalDependencies[target.packageName];
            expect(spec === 'workspace:*' || spec === analytical.version, spec).toBe(true);
        }
    });

    test('each platform package declares Trusted Publisher repository + os/cpu + binary main', () => {
        for (const target of NATIVE_TARGETS) {
            const pkgPath = join(root, 'packages/analytical-native', target.napiSuffix, 'package.json');
            expect(existsSync(pkgPath), pkgPath).toBe(true);
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
                name: string;
                version: string;
                os: string[];
                cpu: string[];
                main: string;
                repository: { url: string };
                publishConfig: { access: string };
            };
            expect(pkg.name).toBe(target.packageName);
            expect(pkg.os).toEqual(target.os);
            expect(pkg.cpu).toEqual(target.cpu);
            expect(pkg.main).toBe(target.binaryName);
            expect(pkg.repository.url).toBe('https://github.com/littletuna4/reqlan.git');
            expect(pkg.publishConfig.access).toBe('public');
        }
    });

    test('extension VSIX layout stages native/ and vscodeignore keeps it', () => {
        const ignore = readFileSync(join(root, 'packages/extension/.vscodeignore'), 'utf8');
        expect(ignore).toMatch(/!native\/\*\*/);
        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        expect(azure).toContain('package-extension-targets.mjs');
        expect(azure).toContain('fetch-native-packages.mjs');
        const deploy = readFileSync(join(root, '.github/workflows/deploy-npm.yml'), 'utf8');
        expect(deploy).toContain('id-token: write');
        expect(deploy).toContain('Publish platform packages');
        expect(deploy).toContain('build-native');
    });
});

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
        const extension = JSON.parse(
            readFileSync(join(root, 'packages/extension/package.json'), 'utf8')
        ) as { version: string };
        expect(extension.version).toBe(analytical.version);
        const changeset = JSON.parse(
            readFileSync(join(root, '.changeset/config.json'), 'utf8')
        ) as { fixed: string[][] };
        expect(
            changeset.fixed.some(
                group => group.includes('reqlan-extension') && group.includes('@reqlan/analytical')
            )
        ).toBe(true);
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
            expect(pkg.version).toBe(
                JSON.parse(readFileSync(join(root, 'packages/analytical/package.json'), 'utf8')).version
            );
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
        expect(azure).toContain('--latest');
        expect(azure).not.toContain('build_native');
        expect(azure).toContain('ensure-host-native.mjs');
        const packScript = readFileSync(join(root, 'scripts/package-extension-targets.mjs'), 'utf8');
        expect(packScript).toContain('assertPackedNativeTarget');
        const extPkg = JSON.parse(
            readFileSync(join(root, 'packages/extension/package.json'), 'utf8')
        ) as { scripts: Record<string, string> };
        expect(extPkg.scripts['vscode:prepublish']).toContain('--skip-native');
        const deployNpm = readFileSync(join(root, '.github/workflows/deploy-npm.yml'), 'utf8');
        expect(deployNpm).toContain('--publish-versions');
        expect(deployNpm).toMatch(/prepare-native-packages\.mjs --publish-versions/);
        expect(deployNpm).toContain('id-token: write');
        expect(deployNpm).toContain('Publish platform packages');
        expect(deployNpm).toContain('build-native');
        const fetchScript = readFileSync(join(root, 'scripts/fetch-native-packages.mjs'), 'utf8');
        expect(fetchScript).toContain('--host-only');
        expect(fetchScript).toContain('--allow-missing');
        expect(fetchScript).toContain('--latest');
        expect(fetchScript).toContain('--retries');
        expect(existsSync(join(root, 'scripts/ensure-host-native.mjs'))).toBe(true);
        const site = readFileSync(join(root, '.github/workflows/deploy-site.yml'), 'utf8');
        expect(site).toContain('stage-host-native.mjs');
        expect(site).toContain('REQLAN_FORCE_NATIVE_BUILD');
    });
});

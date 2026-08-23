/**
 * Release on main reuses one sequential pull-request CI job.
 * That job builds once from this checkout, then crate tests, check, and JS tests reuse it.
 * rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
 * rq:["../../../reqlan rq/distribution/distribution.rq".prerelease_tests]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
 * rq:["../../../reqlan rq/development/build.rq".typescript_compile]
 * rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readWorkflow(name: string): string {
    return readFileSync(join(root, '.github/workflows', name), 'utf8');
}

describe('release CI gate', () => {
    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    test('release calls sequential CI before versioning', () => {
        const release = readWorkflow('release.yml');
        expect(release).toContain('uses: ./.github/workflows/ci.yml');
        expect(release).not.toContain('ci-rust.yml');
        expect(release).not.toContain('ci-check.yml');
        expect(release).not.toContain('ci-test.yml');
        expect(release).toMatch(/needs:\s*\[ci\]/);
        expect(release).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(release).toContain(
            'rq:["../../reqlan rq/distribution/distribution.rq".prerelease_tests]'
        );
        expect(existsSync(join(root, '.github/workflows/ci.yml'))).toBe(true);
        expect(existsSync(join(root, '.github/workflows/ci-rust.yml'))).toBe(false);
        expect(existsSync(join(root, '.github/workflows/ci-check.yml'))).toBe(false);
        expect(existsSync(join(root, '.github/workflows/ci-test.yml'))).toBe(false);
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('CI is one sequential pull-request job', () => {
        const ci = readWorkflow('ci.yml');
        expect(ci).toContain('workflow_call:');
        expect(ci).toContain('pull_request:');
        expect(ci).not.toMatch(/^ {2}push:/m);
        expect(ci).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(ci).toContain(
            'rq:["../../reqlan rq/core_analysis/check.rq".check_meta_implementation]'
        );
        expect(ci).toContain('rq:["../../reqlan rq/development/commit.rq".rust_fmt]');
        expect((ci.match(/^jobs:/gm) ?? []).length).toBe(1);
        expect(ci).toMatch(/^ {2}ci:/m);
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".prerelease_tests]
    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('one build is reused by crate tests, check, and package tests', () => {
        const ci = readWorkflow('ci.yml');
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');

        expect((ci.match(/pnpm install --frozen-lockfile/g) ?? []).length).toBe(1);
        expect((ci.match(/pnpm run build:tsc/g) ?? []).length).toBe(1);
        expect((ci.match(/cargo build -p reqlan-napi --release/g) ?? []).length).toBe(1);
        expect(ci).not.toContain('ensure-host-native');

        const installAt = ci.indexOf('pnpm install --frozen-lockfile');
        const tscAt = ci.indexOf('pnpm run build:tsc');
        const crateCompileAt = ci.indexOf('cargo test --no-run');
        const crateTestAt = ci.indexOf('cargo test --workspace --exclude reqlan-napi\n');
        const checkAt = ci.indexOf('node packages/cli/bin/cli.js check');
        const jsTestAt = ci.indexOf('pnpm run test:js');

        expect(installAt).toBeGreaterThan(-1);
        expect(crateCompileAt).toBeGreaterThan(installAt);
        expect(tscAt).toBeGreaterThan(crateCompileAt);
        expect(crateTestAt).toBeGreaterThan(tscAt);
        expect(checkAt).toBeGreaterThan(crateTestAt);
        expect(jsTestAt).toBeGreaterThan(checkAt);

        expect(pkg.scripts['test:js']).toContain('./packages/cli');
        expect(pkg.scripts['test:js']).toContain('./packages/language');
        expect(pkg.scripts.test).toContain('pnpm run test:js');
        expect(pkg.scripts.test).toContain('pnpm run test:rust');
        expect(pkg.scripts.test.indexOf('pnpm run test:rust')).toBeGreaterThan(
            pkg.scripts.test.indexOf('pnpm run test:js')
        );

        const azureBuildAt = azure.indexOf('pnpm run build:tsc');
        const azureTestAt = azure.indexOf('pnpm run test:js');
        const azureCheckAt = azure.indexOf('node packages/cli/bin/cli.js check');
        expect(azureBuildAt).toBeGreaterThan(-1);
        expect(azureTestAt).toBeGreaterThan(azureBuildAt);
        expect(azureCheckAt).toBeGreaterThan(azureTestAt);
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".prerelease_tests]
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]
    test('pnpm test runs crate tests', () => {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        expect(pkg.scripts['test:rust']).toContain('cargo test');
        expect(pkg.scripts['test:rust']).toContain('--workspace');
        expect(pkg.scripts['test:rust']).toContain('--exclude reqlan-napi');
        expect(pkg.scripts.test).toContain('pnpm run test:rust');
        expect(pkg.scripts.test.indexOf('pnpm run test:rust')).toBeGreaterThan(
            pkg.scripts.test.indexOf('pnpm run test:js')
        );
    });

    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    // rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
    test('reference check uses workspace packages not npm', () => {
        const ci = readWorkflow('ci.yml');
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        const workspaceCli = 'node packages/cli/bin/cli.js check';

        expect(ci).toContain('node scripts/assert-workspace-reqlan.mjs');
        const assertAt = ci.indexOf('node scripts/assert-workspace-reqlan.mjs');
        const checkAt = ci.indexOf(workspaceCli);
        expect(assertAt).toBeGreaterThan(ci.indexOf('pnpm install --frozen-lockfile'));
        expect(checkAt).toBeGreaterThan(assertAt);

        expect(ci).not.toContain('pnpm run check --');
        expect(ci).not.toMatch(/npx reqlan|npm (?:i|install).*@reqlan/);
        expect(ci).not.toContain('pnpm add');
        expect(pkg.scripts.check).toBe(workspaceCli);
        expect(azure).toContain(workspaceCli);
        expect(azure).not.toContain('pnpm run check --');

        const asserted = spawnSync(process.execPath, [join(root, 'scripts/assert-workspace-reqlan.mjs')], {
            cwd: root,
            encoding: 'utf8'
        });
        expect(asserted.status, asserted.stderr).toBe(0);
        expect(asserted.stdout).toContain('@reqlan/cli');
        expect(asserted.stdout).toContain('@reqlan/analytical');
    });

    // rq:["../../../reqlan rq/development/build.rq".typescript_compile]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('TypeScript compile generates Langium sources first', () => {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        expect(pkg.scripts['build:tsc']).toContain('langium:generate');
        expect(pkg.scripts['build:tsc']).toContain('tsc -b tsconfig.build.json');
        expect(pkg.scripts.build.startsWith('pnpm run build:tsc')).toBe(true);

        const ci = readWorkflow('ci.yml');
        expect(ci).toContain('pnpm run build:tsc');
        expect(ci).toContain(
            'rq:["../../reqlan rq/development/build.rq".typescript_compile]'
        );

        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        expect(azure).toContain('pnpm run build:tsc');
        expect(azure).toContain(
            'rq:["reqlan rq/development/build.rq".typescript_compile]'
        );

        const npm = readWorkflow('deploy-npm.yml');
        expect(npm).toContain('pnpm run build:tsc');
        expect(npm).toContain(
            'rq:["../../reqlan rq/development/build.rq".typescript_compile]'
        );
    });

    // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('CI check skips gitignored targets', () => {
        const ci = readWorkflow('ci.yml');
        expect(ci).toContain('--skip-gitignored-targets');
        expect(ci).toContain('node packages/cli/bin/cli.js check');
        expect(ci).toContain(
            'rq:["../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]'
        );

        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        expect(azure).toContain('--skip-gitignored-targets');
        expect(azure).toContain('node packages/cli/bin/cli.js check');
        expect(azure).toContain(
            'rq:["reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]'
        );
    });
});

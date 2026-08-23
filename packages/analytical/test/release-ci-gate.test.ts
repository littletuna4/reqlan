/**
 * Release on main must reuse pull-request rust, check, and test workflows.
 * Check compiles this checkout and runs the workspace CLI.
 * rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
 * rq:["../../../reqlan rq/distribution/distribution.rq".prerelease_tests]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
 * rq:["../../../reqlan rq/development/build.rq".typescript_compile]
 * rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readWorkflow(name: string): string {
    return readFileSync(join(root, '.github/workflows', name), 'utf8');
}

describe('release CI gate', () => {
    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    test('release calls rust, check, and test workflows before versioning', () => {
        const release = readWorkflow('release.yml');
        expect(release).toContain('uses: ./.github/workflows/ci-rust.yml');
        expect(release).toContain('uses: ./.github/workflows/ci-check.yml');
        expect(release).toContain('uses: ./.github/workflows/ci-test.yml');
        expect(release).toMatch(/needs:\s*\[ci-rust,\s*ci-check,\s*ci-test\]/);
        expect(release).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(release).toContain(
            'rq:["../../reqlan rq/distribution/distribution.rq".prerelease_tests]'
        );
        expect(existsSync(join(root, '.github/workflows/ci-check.yml'))).toBe(true);
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('CI workflows stay reusable and pull-request triggered', () => {
        const rust = readWorkflow('ci-rust.yml');
        const check = readWorkflow('ci-check.yml');
        const tests = readWorkflow('ci-test.yml');

        expect(rust).toContain('workflow_call:');
        expect(check).toContain('workflow_call:');
        expect(tests).toContain('workflow_call:');
        expect(rust).toContain('pull_request:');
        expect(check).toContain('pull_request:');
        expect(tests).toContain('pull_request:');

        expect(rust).not.toMatch(/^ {2}push:/m);
        expect(check).not.toMatch(/^ {2}push:/m);
        expect(tests).not.toMatch(/^ {2}push:/m);

        expect(rust).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(check).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(check).toContain(
            'rq:["../../reqlan rq/core_analysis/check.rq".check_meta_implementation]'
        );
        expect(tests).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".prerelease_tests]
    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    test('JS CI builds from this checkout then tests', () => {
        const tests = readWorkflow('ci-test.yml');
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');

        const buildAt = tests.indexOf('pnpm run build:tsc');
        const testAt = tests.indexOf('pnpm run test');
        expect(buildAt).toBeGreaterThan(-1);
        expect(testAt).toBeGreaterThan(buildAt);

        expect(tests).not.toContain('node packages/cli/bin/cli.js check');
        expect(pkg.scripts['build:cli']).toContain('@reqlan/cli');
        expect(tests).toContain(
            'rq:["../../reqlan rq/distribution/distribution.rq".prerelease_tests]'
        );

        const azureBuildAt = azure.indexOf('pnpm run build:tsc');
        const azureTestAt = azure.indexOf('pnpm run test');
        expect(azureBuildAt).toBeGreaterThan(-1);
        expect(azureTestAt).toBeGreaterThan(azureBuildAt);
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
            pkg.scripts.test.indexOf('packages/extension')
        );
    });

    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    // rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
    test('reference check uses the workspace CLI', () => {
        const check = readWorkflow('ci-check.yml');
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        const workspaceCli = 'node packages/cli/bin/cli.js check';

        const buildAt = check.indexOf('pnpm run build:tsc');
        const checkAt = check.indexOf(workspaceCli);
        expect(buildAt).toBeGreaterThan(-1);
        expect(checkAt).toBeGreaterThan(buildAt);

        expect(check).not.toContain('pnpm run build:cli');
        expect(check).not.toContain('pnpm run check --');
        expect(check).not.toMatch(/npx reqlan|npm (?:i|install).*@reqlan\/cli/);
        expect(pkg.scripts.check).toBe(workspaceCli);

        const azureCheckAt = azure.indexOf(workspaceCli);
        expect(azureCheckAt).toBeGreaterThan(azure.indexOf('pnpm run test'));
        expect(azure).not.toContain('pnpm run check --');
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

        const tests = readWorkflow('ci-test.yml');
        expect(tests).toContain('pnpm run build:tsc');
        expect(tests).toContain(
            'rq:["../../reqlan rq/development/build.rq".typescript_compile]'
        );

        const check = readWorkflow('ci-check.yml');
        expect(check).toContain('pnpm run build:tsc');
        expect(check).toContain(
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

    // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('CI check skips gitignored .cursor targets', () => {
        const check = readWorkflow('ci-check.yml');
        expect(check).toContain('--skip-target "**/.cursor/**"');
        expect(check).toContain('node packages/cli/bin/cli.js check');
        expect(check).toContain(
            'rq:["../../reqlan rq/core_analysis/check.rq".check_skip_targets]'
        );

        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        expect(azure).toContain('--skip-target "**/.cursor/**"');
        expect(azure).toContain('node packages/cli/bin/cli.js check');
        expect(azure).toContain('rq:["reqlan rq/core_analysis/check.rq".check_skip_targets]');
    });
});

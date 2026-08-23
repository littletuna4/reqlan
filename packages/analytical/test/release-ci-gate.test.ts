/**
 * Release on main must reuse pull-request rust and JS workflows.
 * JS CI compiles this checkout, runs package tests, then checks with the workspace CLI.
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
    test('release calls rust and JS workflows before versioning', () => {
        const release = readWorkflow('release.yml');
        expect(release).toContain('uses: ./.github/workflows/ci-rust.yml');
        expect(release).toContain('uses: ./.github/workflows/ci-test.yml');
        expect(release).not.toContain('ci-check.yml');
        expect(release).toMatch(/needs:\s*\[ci-rust,\s*ci-test\]/);
        expect(release).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(release).toContain(
            'rq:["../../reqlan rq/distribution/distribution.rq".prerelease_tests]'
        );
        expect(existsSync(join(root, '.github/workflows/ci-check.yml'))).toBe(false);
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('CI workflows stay reusable and pull-request triggered', () => {
        const rust = readWorkflow('ci-rust.yml');
        const js = readWorkflow('ci-test.yml');

        expect(rust).toContain('workflow_call:');
        expect(js).toContain('workflow_call:');
        expect(rust).toContain('pull_request:');
        expect(js).toContain('pull_request:');

        expect(rust).not.toMatch(/^ {2}push:/m);
        expect(js).not.toMatch(/^ {2}push:/m);

        expect(rust).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(js).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(js).toContain(
            'rq:["../../reqlan rq/core_analysis/check.rq".check_meta_implementation]'
        );
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".prerelease_tests]
    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('JS CI builds from this checkout then tests then checks', () => {
        const js = readWorkflow('ci-test.yml');
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        const workspaceCli = 'node packages/cli/bin/cli.js check';

        const buildAt = js.indexOf('pnpm run build:tsc');
        const testAt = js.indexOf('pnpm run test');
        const checkAt = js.indexOf(workspaceCli);
        expect(buildAt).toBeGreaterThan(-1);
        expect(testAt).toBeGreaterThan(buildAt);
        expect(checkAt).toBeGreaterThan(testAt);

        expect(js).not.toContain('pnpm run build:cli');
        expect(js).not.toContain('pnpm run check --');
        expect(js).not.toMatch(/npx reqlan|npm (?:i|install).*@reqlan\/cli/);
        expect(pkg.scripts.check).toBe(workspaceCli);
        expect(pkg.scripts['build:cli']).toContain('@reqlan/cli');

        const azureBuildAt = azure.indexOf('pnpm run build:tsc');
        const azureTestAt = azure.indexOf('pnpm run test');
        const azureCheckAt = azure.indexOf(workspaceCli);
        expect(azureBuildAt).toBeGreaterThan(-1);
        expect(azureTestAt).toBeGreaterThan(azureBuildAt);
        expect(azureCheckAt).toBeGreaterThan(azureTestAt);
        expect(azure).not.toContain('pnpm run check --');
        expect(js).toContain(
            'rq:["../../reqlan rq/distribution/distribution.rq".prerelease_tests]'
        );
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
        const js = readWorkflow('ci-test.yml');
        expect(js).toContain('--skip-target "**/.cursor/**"');
        expect(js).toContain('node packages/cli/bin/cli.js check');
        expect(js).toContain(
            'rq:["../../reqlan rq/core_analysis/check.rq".check_skip_targets]'
        );

        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        expect(azure).toContain('--skip-target "**/.cursor/**"');
        expect(azure).toContain('node packages/cli/bin/cli.js check');
        expect(azure).toContain('rq:["reqlan rq/core_analysis/check.rq".check_skip_targets]');
    });
});

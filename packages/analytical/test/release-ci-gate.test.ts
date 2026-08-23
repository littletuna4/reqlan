/**
 * Release on main must reuse pull-request rust and check workflows.
 * Package tests run only as a pre-release gate.
 * rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
 * rq:["../../../reqlan rq/distribution/distribution.rq".prerelease_tests]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
 * rq:["../../../reqlan rq/development/build.rq".typescript_compile]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readWorkflow(name: string): string {
    return readFileSync(join(root, '.github/workflows', name), 'utf8');
}

describe('release CI gate', () => {
    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    test('release calls rust and check workflows before versioning', () => {
        const release = readWorkflow('release.yml');
        expect(release).toContain('uses: ./.github/workflows/ci-rust.yml');
        expect(release).toContain('uses: ./.github/workflows/ci-check.yml');
        expect(release).toContain('uses: ./.github/workflows/ci-test.yml');
        expect(release).toMatch(/needs:\s*\[ci-rust,\s*ci-check,\s*ci-test\]/);
        expect(release).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(release).toContain(
            'rq:["../../reqlan rq/distribution/distribution.rq".prerelease_tests]'
        );
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_meta_implementation]
    test('CI workflows stay reusable and pull-request triggered', () => {
        const rust = readWorkflow('ci-rust.yml');
        const check = readWorkflow('ci-check.yml');

        expect(rust).toContain('workflow_call:');
        expect(check).toContain('workflow_call:');
        expect(rust).toContain('pull_request:');
        expect(check).toContain('pull_request:');

        expect(rust).not.toMatch(/^ {2}push:/m);
        expect(check).not.toMatch(/^ {2}push:/m);

        expect(rust).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(check).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
        expect(check).toContain(
            'rq:["../../reqlan rq/core_analysis/check.rq".check_meta_implementation]'
        );
        expect(check).toContain('pnpm run build:cli');
        expect(check).not.toContain('pnpm run build:tsc');
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".prerelease_tests]
    // rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
    test('package tests run as a pre-release gate, not on pull requests', () => {
        const tests = readWorkflow('ci-test.yml');
        expect(tests).toContain('workflow_call:');
        expect(tests).not.toContain('pull_request:');
        expect(tests).toContain('pnpm run build:tsc');
        expect(tests).toContain('pnpm run test');
        expect(tests).toContain(
            'rq:["../../reqlan rq/distribution/distribution.rq".prerelease_tests]'
        );

        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };
        expect(pkg.scripts['build:cli']).toContain('@reqlan/cli');
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
        const check = readWorkflow('ci-check.yml');
        expect(check).toContain('--skip-target "**/.cursor/**"');
        expect(check).toContain(
            'rq:["../../reqlan rq/core_analysis/check.rq".check_skip_targets]'
        );

        const azure = readFileSync(join(root, 'azure-pipelines.yml'), 'utf8');
        expect(azure).toContain('--skip-target "**/.cursor/**"');
        expect(azure).toContain('rq:["reqlan rq/core_analysis/check.rq".check_skip_targets]');
    });
});

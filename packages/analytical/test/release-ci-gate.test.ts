/**
 * Release on main must reuse pull-request rust and check workflows.
 * rq:["../../../reqlan rq/distribution/distribution.rq".ci_gate]
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
        expect(release).toMatch(/needs:\s*\[ci-rust,\s*ci-check\]/);
        expect(release).toContain('rq:["../../reqlan rq/distribution/distribution.rq".ci_gate]');
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
});

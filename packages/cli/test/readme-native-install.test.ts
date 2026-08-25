/**
 * CLI README documents pnpm recovery from all-platform or no-native installs.
 * rq:["../../../reqlan rq/distribution/native_host_binary.rq".published_host_native_install]
 * rq:["../../../reqlan rq/distribution/distribution.rq".npm_package_readme]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, '../README.template.md'), 'utf8');
const readme = readFileSync(join(here, '../README.md'), 'utf8');

describe('CLI native install note', () => {
    test('README template tells pnpm users how to keep only the host arch', () => {
        expect(template).toContain('Native engine (pnpm)');
        expect(template).toContain('Do not keep every platform package');
        expect(template).toContain('Do not keep none');
        expect(template).toContain('--force');
        expect(template).toContain('supportedArchitectures');
        expect(template).toContain('os: [current]');
        expect(template).toContain('cpu: [current]');
        expect(template).toContain('--no-optional');
        expect(template).toContain('optional=false');
        expect(template).toContain('omit=optional');
        expect(template).toContain('pnpm remove -g @reqlan/cli');
        expect(template).toContain('--os <platform> --cpu <arch>');
        expect(template).toContain('warns when that host package is missing');
        expect(readme).toContain('Native engine (pnpm)');
        expect(readme).toContain('supportedArchitectures');
    });
});

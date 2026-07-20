import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { ONBOARDING_OUTPUT_REL, ONBOARDING_TEMPLATE_REL } from '../scripts/onboarding-rq-build.ts';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function vscodeIgnorePatterns(): string[] {
    return readFileSync(join(extensionRoot, '.vscodeignore'), 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
}

function isIgnoredByVsce(relativePath: string, patterns: string[]): boolean {
    const normalized = relativePath.replace(/\\/g, '/');

    return patterns.some(pattern => {
        if (pattern.endsWith('/**')) {
            const prefix = pattern.slice(0, -3);
            return normalized === prefix || normalized.startsWith(`${prefix}/`);
        }

        if (pattern.includes('*')) {
            const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
            return regex.test(normalized);
        }

        return normalized === pattern || normalized.startsWith(`${pattern}/`);
    });
}

describe('extension VSIX packaging', () => {
    test('build.mjs generates onboarding rq before bundling', () => {
        const buildScript = readFileSync(join(extensionRoot, 'scripts/build.mjs'), 'utf8');

        expect(buildScript).toContain('build:onboarding');
        expect(buildScript.indexOf('build:onboarding')).toBeLessThan(buildScript.indexOf('node esbuild.mjs'));
    });

    test('built onboarding rq is packaged and the source template is excluded', () => {
        const patterns = vscodeIgnorePatterns();

        expect(isIgnoredByVsce(ONBOARDING_TEMPLATE_REL, patterns)).toBe(true);
        expect(isIgnoredByVsce(ONBOARDING_OUTPUT_REL, patterns)).toBe(false);
    });
});

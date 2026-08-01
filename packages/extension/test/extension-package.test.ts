import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ONBOARDING_TEMPLATE_REL = 'templates/thanks-for-installing.template.rq';
const ONBOARDING_WEBVIEW_MEDIA_REL = 'media/webviews/onboarding';
const EXPORT_FORM_WEBVIEW_MEDIA_REL = 'media/webviews/export-form';

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
    test('build.mjs bundles onboarding and export-form webviews with other webviews', () => {
        const buildScript = readFileSync(join(extensionRoot, 'scripts/build.mjs'), 'utf8');

        expect(buildScript).toContain('webviews/onboarding/vite.config.ts');
        expect(buildScript).toContain('webviews/export-form/vite.config.ts');
        expect(buildScript).not.toContain('build:onboarding');
        expect(buildScript.indexOf('webviews/onboarding/vite.config.ts')).toBeLessThan(
            buildScript.indexOf('node esbuild.mjs'),
        );
        expect(buildScript.indexOf('webviews/export-form/vite.config.ts')).toBeLessThan(
            buildScript.indexOf('node esbuild.mjs'),
        );
    });

    test('onboarding webview media is packaged and the source template is excluded', () => {
        const patterns = vscodeIgnorePatterns();

        expect(isIgnoredByVsce(ONBOARDING_TEMPLATE_REL, patterns)).toBe(true);
        expect(isIgnoredByVsce(ONBOARDING_WEBVIEW_MEDIA_REL, patterns)).toBe(false);
        expect(isIgnoredByVsce(`${ONBOARDING_WEBVIEW_MEDIA_REL}/main.js`, patterns)).toBe(false);
    });

    test('export-form webview media is packaged', () => {
        const patterns = vscodeIgnorePatterns();

        expect(isIgnoredByVsce(EXPORT_FORM_WEBVIEW_MEDIA_REL, patterns)).toBe(false);
        expect(isIgnoredByVsce(`${EXPORT_FORM_WEBVIEW_MEDIA_REL}/main.js`, patterns)).toBe(false);
    });
});

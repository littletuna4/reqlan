import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
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

describe('search code action host wiring', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('extension main passes language client getter to import-error commands', () => {
        const mainSource = readFileSync(
            join(extensionRoot, 'src/extension/main.ts'),
            'utf8'
        );
        expect(mainSource).toContain(
            'registerImportErrorCommands(context, submodule.index, () => client)'
        );
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('language server registers reqlan/referenceSearchSite', () => {
        const languageMain = readFileSync(
            join(extensionRoot, 'src/language/main.ts'),
            'utf8'
        );
        expect(languageMain).toContain('REQLAN_REFERENCE_SEARCH_SITE_REQUEST');
        expect(languageMain).toContain('resolveReferenceSearchSiteFromDocument');
        expect(languageMain).toContain('getParsedDocument');
    });
});

describe('idea move palette commands', () => {
    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
    test('package.json contributes move idea and move idea content commands', () => {
        const pkg = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8')) as {
            contributes: { commands: Array<{ command: string; title: string }> };
        };
        const commands = pkg.contributes.commands;
        expect(commands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    command: 'reqlan.refactor.moveIdea',
                    title: 'Move Idea to Another File'
                }),
                expect.objectContaining({
                    command: 'reqlan.refactor.moveIdeaContent',
                    title: 'Move Idea Content to Another File'
                })
            ])
        );
        const registerSource = readFileSync(
            join(extensionRoot, 'src/refactor_module/register-idea-refactor-commands.ts'),
            'utf8'
        );
        expect(registerSource).toContain('REQLAN_REFACTOR_MOVE_IDEA_CONTENT_COMMAND');
        expect(registerSource).toContain('leaveSourceStub: true');
    });
});

describe('extension host esbuild CJS import.meta', () => {
    // rq:["../../../reqlan rq/extension/startup-performance.rq".invalid_url_activation_failure]
    test('rewrites import.meta.url instead of emptying it for ES2017 CJS', async () => {
        const esbuildScript = readFileSync(join(extensionRoot, 'esbuild.mjs'), 'utf8');
        expect(esbuildScript).toContain("'import.meta.url': 'import_meta_url'");
        expect(esbuildScript).toContain('pathToFileURL(__filename)');

        const result = await esbuild.transform('export const moduleUrl = import.meta.url;', {
            format: 'cjs',
            platform: 'node',
            target: 'es2017',
            define: { 'import.meta.url': 'import_meta_url' }
        });
        expect(result.warnings.map(warning => warning.text)).toEqual([]);
        expect(result.code).toContain('import_meta_url');
        expect(result.code).not.toMatch(/import\.meta/);
        expect(result.code).not.toContain('const import_meta = {}');
    });
});

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
    defaultExportFormSettings,
    exportSettingsPath,
    loadExportFormSettings,
    resolveOutputDir,
    saveExportFormSettings
} from '../src/analytical_submodule/export/export-settings.js';

describe('export form settings persistence', () => {
    const tempRoots: string[] = [];

    afterEach(() => {
        for (const root of tempRoots.splice(0)) {
            rmSync(root, { recursive: true, force: true });
        }
    });

    function tempWorkspace(): string {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-export-settings-'));
        tempRoots.push(root);
        return root;
    }

    test('loads defaults when export_settings.json is missing', () => {
        const workspaceRoot = tempWorkspace();
        const settings = loadExportFormSettings(workspaceRoot);
        expect(settings).toEqual(defaultExportFormSettings(workspaceRoot));
        expect(settings.format).toBe('html');
        expect(settings.advancedExpanded).toBe(false);
        expect(settings.runtimeMode).toBe('interactive');
    });

    test('saves under .reqlan/export_settings.json and reloads', () => {
        const workspaceRoot = tempWorkspace();
        const settings = {
            ...defaultExportFormSettings(workspaceRoot),
            format: 'pdf' as const,
            exportName: 'docs-site',
            runtimeMode: 'document' as const,
            excludeSecretFiles: true,
            excludeIgnoredFiles: true,
            urlBase: '/spec',
            headerHref: '/',
            headerLabel: 'Home',
            advancedExpanded: true,
            includeCodeFilePages: false
        };

        saveExportFormSettings(workspaceRoot, settings);

        const path = exportSettingsPath(workspaceRoot);
        expect(path).toBe(join(workspaceRoot, '.reqlan', 'export_settings.json'));
        const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
        expect(raw.format).toBe('pdf');
        expect(raw.exportName).toBe('docs-site');
        expect(raw.runtimeMode).toBe('document');
        expect(raw.excludeSecretFiles).toBe(true);
        expect(raw.excludeIgnoredFiles).toBe(true);
        expect(raw.advancedExpanded).toBe(true);

        const loaded = loadExportFormSettings(workspaceRoot);
        expect(loaded.format).toBe('pdf');
        expect(loaded.exportName).toBe('docs-site');
        expect(loaded.runtimeMode).toBe('document');
        expect(loaded.excludeSecretFiles).toBe(true);
        expect(loaded.excludeIgnoredFiles).toBe(true);
        expect(loaded.urlBase).toBe('/spec');
        expect(loaded.headerLabel).toBe('Home');
        expect(loaded.includeCodeFilePages).toBe(false);
        expect(loaded.advancedExpanded).toBe(true);
    });

    test('stores workspace-relative outputDir when under the workspace', () => {
        const workspaceRoot = tempWorkspace();
        const absolute = join(workspaceRoot, 'out', 'html');
        saveExportFormSettings(workspaceRoot, {
            ...defaultExportFormSettings(workspaceRoot),
            outputDir: absolute
        });
        const raw = JSON.parse(readFileSync(exportSettingsPath(workspaceRoot), 'utf8')) as {
            outputDir: string;
        };
        expect(raw.outputDir).toBe(join('out', 'html'));
        expect(resolveOutputDir(workspaceRoot, raw.outputDir)).toBe(absolute);
    });
});

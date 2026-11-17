import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, test } from 'vitest';
import {
    nativeEngineAvailable,
    openAnalysisApi,
    resetNativeEngineCache
} from '../src/index.js';

describe('native html export', () => {
    afterEach(() => {
        resetNativeEngineCache();
    });

    test('NativeAnalysisApi writes a multi-file html site', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = join(tmpdir(), `reqlan-native-html-${randomUUID()}`);
        await mkdir(join(root, '.reqlan'), { recursive: true });
        await writeFile(
            join(root, 'demo.rq'),
            'demo {\n    body links nowhere\n    @status pending\n}\n',
            'utf8'
        );
        const outputDir = join(tmpdir(), `reqlan-native-html-out-${randomUUID()}`);
        const opened = await openAnalysisApi({ workspaceRoot: root });
        try {
            const result = await opened.api.exportHtml({
                format: 'html',
                outputDir,
                exportName: 'site',
                templateId: 'default',
                scope: 'workspace',
                includeRequirementsPage: true,
                includeGraphPage: true,
                includeIdeaPages: true,
                includeFilePages: true,
                includeCodeFilePages: true,
                includeClusterPages: true,
                includeAttributePages: true,
                includePrintPages: true
            });
            const indexHtml = await readFile(result.indexFilePath, 'utf8');
            expect(indexHtml).toContain('site');
            expect(await readFile(join(result.outputDir, 'assets/app.js'), 'utf8')).toContain(
                'wireTables'
            );
        } finally {
            await opened.dispose();
        }
    });

    test('NativeAnalysisApi respects includeFolderPages flag', async () => {
        if (!nativeEngineAvailable()) {
            return;
        }
        const root = join(tmpdir(), `reqlan-native-html-folder-${randomUUID()}`);
        await mkdir(join(root, '.reqlan'), { recursive: true });
        await mkdir(join(root, 'reqs'), { recursive: true });
        await writeFile(
            join(root, 'demo.rq'),
            'demo {\n    body links nowhere\n    @status pending\n}\n',
            'utf8'
        );
        await writeFile(
            join(root, 'reqs', 'nested.rq'),
            'nested {\n    body links nowhere\n    @status todo\n}\n',
            'utf8'
        );
        const outputDir = join(tmpdir(), `reqlan-native-html-out-${randomUUID()}`);
        const opened = await openAnalysisApi({ workspaceRoot: root });
        try {
            const enabledResult = await opened.api.exportHtml({
                format: 'html',
                outputDir,
                exportName: 'site',
                templateId: 'default',
                scope: 'workspace',
                includeRequirementsPage: true,
                includeGraphPage: true,
                includeIdeaPages: true,
                includeFilePages: true,
                includeCodeFilePages: true,
                includeClusterPages: true,
                includeAttributePages: true,
                includePrintPages: true,
                includeFolderPages: true,
            });
            const enabledFoldersPath = join(enabledResult.outputDir, 'folders.html');
            expect(existsSync(enabledFoldersPath)).toBe(true);
            const enabledFoldersIndex = await readFile(enabledFoldersPath, 'utf8');
            expect(enabledFoldersIndex).toContain('Folders index');
            expect(enabledFoldersIndex).toContain('Root');
            expect(enabledFoldersIndex).toContain('reqs');
            expect(existsSync(join(enabledResult.outputDir, 'folders', 'reqs.html'))).toBe(true);

            const disabledResult = await opened.api.exportHtml({
                format: 'html',
                outputDir,
                exportName: 'site-disabled',
                templateId: 'default',
                scope: 'workspace',
                includeRequirementsPage: true,
                includeGraphPage: true,
                includeIdeaPages: true,
                includeFilePages: true,
                includeCodeFilePages: true,
                includeClusterPages: true,
                includeAttributePages: true,
                includePrintPages: true,
                includeFolderPages: false,
            });
            expect(existsSync(join(disabledResult.outputDir, 'folders.html'))).toBe(false);
        } finally {
            await opened.dispose();
        }
    });
});
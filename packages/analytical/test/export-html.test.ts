/**
 * HTML export is native (`reqlan-export` via NativeAnalysisApi).
 * rq:["../../reqlan rq/core_analysis/html_export.rq".html_export]
 * rq:["../../reqlan rq/core_analysis/rust_port.rq".export_rust]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
});

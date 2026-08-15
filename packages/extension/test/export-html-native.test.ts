/**
 * Extension HTML/PDF export must call the native writer, not the removed TS pipeline.
 * rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export]
 * rq:["../../../reqlan rq/extension/features-html-export.rq".html_export_form]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('extension html export host', () => {
    test('export form runs HTML through openAnalysisApi', () => {
        const source = readFileSync(
            join(here, '../src/analytical_submodule/export/export-form-panel.ts'),
            'utf8'
        );
        expect(source).toContain('openAnalysisApi');
        expect(source).toContain('opened.api.exportHtml');
        expect(source).not.toContain('exportHtml(store');
        expect(source).not.toContain('writeHtmlExport');
        expect(source).not.toContain("from './export/export-html");
    });
});

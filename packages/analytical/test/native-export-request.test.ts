/**
 * Native HTML export must forward host page options to the napi DTO.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../reqlan rq/site/site.rq".spec_html_export]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('native export request mapping', () => {
    test('NativeAnalysisApi forwards graph page, url base, and header link', () => {
        const source = readFileSync(join(here, '../src/native/native-analysis-api.ts'), 'utf8');
        expect(source).toContain('includeGraphPage: request.includeGraphPage');
        expect(source).toContain('includeRequirementsPage: request.includeRequirementsPage');
        expect(source).toContain('urlBase: request.urlBase');
        expect(source).toContain('headerLink: request.headerLink');
    });

    test('published analytical barrel no longer exports the TS html writer', () => {
        const source = readFileSync(join(here, '../src/index.ts'), 'utf8');
        expect(source).not.toContain("from './export/export-html.js'");
        expect(source).not.toContain("from './export/write-html-export.js'");
        expect(source).toContain('NativeAnalysisApi');
    });
});

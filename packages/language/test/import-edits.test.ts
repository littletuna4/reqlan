/**
 * Helpers for import insertion text edits.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 */
import { describe, expect, test } from 'vitest';
import { URI } from 'langium';
import {
    fileBasenameAlias,
    relativeRqImportPath
} from '../src/reqlan-import-edits.js';

describe('import edit helpers', () => {
    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
    test('builds relative import paths with leading ./', () => {
        expect(
            relativeRqImportPath(
                URI.parse('file:///workspace/app/a.rq'),
                URI.parse('file:///workspace/app/b.rq')
            )
        ).toBe('./b.rq');
        expect(
            relativeRqImportPath(
                URI.parse('file:///workspace/app/a.rq'),
                URI.parse('file:///workspace/lib/b.rq')
            )
        ).toBe('../lib/b.rq');
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
    test('derives a safe namespace alias from file basename', () => {
        expect(fileBasenameAlias('file:///tmp/my-file.rq')).toBe('my_file');
        expect(fileBasenameAlias('file:///tmp/123.rq')).toBe('_123');
    });
});

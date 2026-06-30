import { describe, expect, test } from 'vitest';
import { findCommentReferencesInText } from '../src/reqlan-comment-resolver.js';
import { findEmbeddedFileReferencesInText } from '../src/reqlan-embedded-file-references.js';
import { findTestLineInText, parseFileReferenceString } from '../src/reqlan-file-references.js';
import { unquoteReqlanString } from '../src/reqlan-references.js';

describe('Comment and file reference utilities', () => {

    test('unquotes reqlan string literals for anonymous import paths', () => {
        expect(unquoteReqlanString('"./ontology.rq"')).toBe('./ontology.rq');
        expect(unquoteReqlanString('./ontology.rq')).toBe('./ontology.rq');
    });

    test('finds rq: comment references in line comments', () => {
        const sample = findCommentReferencesInText('// see rq:"./main.rq".myidea for details');
        expect(sample).toHaveLength(1);
        expect(sample[0]).toMatchObject({ path: './main.rq', idea: 'myidea' });
    });

    test('parses L# line suffix from file reference strings', () => {
        expect(parseFileReferenceString('./apythonfile.pyL#1-2')).toEqual({
            filePath: './apythonfile.py',
            lineStart: 1,
            lineEnd: 2
        });
        expect(parseFileReferenceString('./apythonfile.py')).toEqual({ filePath: './apythonfile.py' });
    });

    test('parses :test name suffix from file reference strings', () => {
        expect(parseFileReferenceString('../../packages/language/test/validating.test.ts:reports duplicate when local idea shares imported idea name')).toEqual({
            filePath: '../../packages/language/test/validating.test.ts',
            testName: 'reports duplicate when local idea shares imported idea name'
        });
    });

    test('finds embedded file references in @tests lists', () => {
        const sample = findEmbeddedFileReferencesInText(
            '@tests: ( ["../../packages/language/test/validating.test.ts:reports duplicate"] )'
        );
        expect(sample).toHaveLength(1);
        expect(sample[0]?.file).toContain('validating.test.ts');
    });

    test('finds vitest test lines by name', () => {
        const sample = `describe('Validating', () => {
    test('reports duplicate when local idea shares imported idea name', async () => {
        expect(true).toBe(true);
    });
});`;
        expect(findTestLineInText(sample, 'reports duplicate when local idea shares imported idea name')).toBe(1);
    });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
    findCommentReferencesInText,
    findCommentSpansInText,
    findLineCommentStart,
    parseCommentReferenceTarget
} from '../src/reqlan-comment-resolver.js';
import { findEmbeddedFileReferencesInText } from '../src/reqlan-embedded-file-references.js';
import { findTestLineInText, parseFileReferenceString } from '../src/reqlan-file-references.js';
import { parseMarkdownLink, unquoteReqlanString } from '../src/reqlan-references.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const demoDir = join(repoRoot, 'reqlan rq/extension/features-code-comment');

describe('Comment and file reference utilities', () => {

    // rq:["../../../reqlan rq/language/syntax.rq".anonymous_imports_allowed]
    test('unquotes reqlan string literals for anonymous import paths', () => {
        expect(unquoteReqlanString('"./ontology.rq"')).toBe('./ontology.rq');
        expect(unquoteReqlanString('./ontology.rq')).toBe('./ontology.rq');
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('parses qualified and local rq: bracket comment reference targets', () => {
        expect(parseCommentReferenceTarget('"./main.rq".myidea')).toMatchObject({
            path: './main.rq',
            idea: 'myidea'
        });
        expect(parseCommentReferenceTarget('myidea')).toMatchObject({ idea: 'myidea' });
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('finds rq: bracket comment references in line comments', () => {
        const sample = findCommentReferencesInText('// see rq:["./main.rq".myidea] for details');
        expect(sample).toHaveLength(1);
        expect(sample[0]).toMatchObject({ path: './main.rq', idea: 'myidea' });
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('finds rq: local comment references in line comments', () => {
        const sample = findCommentReferencesInText('# rq:[myidea]');
        expect(sample).toHaveLength(1);
        expect(sample[0]).toMatchObject({ idea: 'myidea' });
        expect(sample[0]?.path).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('finds rq: comment references in block comments', () => {
        const sample = findCommentReferencesInText(`/**
         * built to comply with rq:["../file.rq".ideaname]
         */`);
        expect(sample).toHaveLength(1);
        expect(sample[0]).toMatchObject({ path: '../file.rq', idea: 'ideaname' });
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('finds rq: comment references in python triple-quoted comments', () => {
        const sample = findCommentReferencesInText(`'''
    rq:["./functional-code-comment-references.rq".references_in_functional_code_comments]
    '''`);
        expect(sample).toHaveLength(1);
        expect(sample[0]).toMatchObject({
            path: './functional-code-comment-references.rq',
            idea: 'references_in_functional_code_comments'
        });
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('finds rq: references in feature demo source files', () => {
        const js = readFileSync(join(demoDir, 'features-code-comment.text.js'), 'utf8');
        const py = readFileSync(join(demoDir, 'features-code-comment.text.py'), 'utf8');
        const jsRefs = findCommentReferencesInText(js);
        const pyRefs = findCommentReferencesInText(py);
        expect(jsRefs.length).toBeGreaterThanOrEqual(2);
        expect(pyRefs.length).toBeGreaterThanOrEqual(2);
        for (const ref of [...jsRefs, ...pyRefs]) {
            expect(ref).toMatchObject({
                path: './functional-code-comment-references.rq',
                idea: 'references_in_functional_code_comments'
            });
        }
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comments]
    test('ignores // inside string literals when locating line comments', () => {
        expect(findLineCommentStart('const url = "https://not a comment.com";')).toBe(-1);
        expect(findLineCommentStart('const note = "//also not a comment"; // real')).toBe(
            'const note = "//also not a comment"; // real'.indexOf('// real')
        );
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('ignores rq references outside comment spans', () => {
        const sample = findCommentReferencesInText('const x = "https://x.com // rq:[\\"./main.rq\\".myidea]";');
        expect(sample).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('findCommentSpansInText includes slash and hash line comments', () => {
        const text = 'code // line\n# hash';
        const spans = findCommentSpansInText(text);
        expect(spans).toHaveLength(2);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_file]
    test('parses L# line suffix from file reference strings', () => {
        expect(parseFileReferenceString('./apythonfile.pyL#1-2')).toEqual({
            filePath: './apythonfile.py',
            lineStart: 1,
            lineEnd: 2
        });
        expect(parseFileReferenceString('./apythonfile.py')).toEqual({ filePath: './apythonfile.py' });
    });

    // rq:["../../../reqlan rq/language/syntax.rq".markdown_links]
    test('parses markdown link label and target from raw link text', () => {
        expect(parseMarkdownLink('[the reqlan rq folder](../../reqlan rq)')).toEqual({
            label: 'the reqlan rq folder',
            target: '../../reqlan rq'
        });
    });

    // rq:["../../../reqlan rq/development/core.rq".testing]
    test('parses :test name suffix from file reference strings', () => {
        expect(parseFileReferenceString('../../packages/language/test/validating.test.ts:reports duplicate when local idea shares imported idea name')).toEqual({
            filePath: '../../packages/language/test/validating.test.ts',
            testName: 'reports duplicate when local idea shares imported idea name'
        });
    });

    // rq:["../../../reqlan rq/language/syntax.rq".markdown_links]
    test('embedded file reference scan ignores markdown link labels', () => {
        const sample = findEmbeddedFileReferencesInText(
            'see [the label](../../path.rq) and ["../../packages/language/test/validating.test.ts"]'
        );
        expect(sample).toHaveLength(1);
        expect(sample[0]?.file).toContain('validating.test.ts');
    });

    // rq:["../../../reqlan rq/development/core.rq".testing]
    test('finds embedded file references in @tests lists', () => {
        const sample = findEmbeddedFileReferencesInText(
            '@tests: ( ["../../packages/language/test/validating.test.ts:reports duplicate"] )'
        );
        expect(sample).toHaveLength(1);
        expect(sample[0]?.file).toContain('validating.test.ts');
    });

    // rq:["../../../reqlan rq/development/core.rq".testing]
    test('finds vitest test lines by name', () => {
        const sample = [
            "describe('Validating', () => {",
            "    test('reports duplicate when local idea shares imported idea name', async () => {",
            '        expect(true).toBe(true);',
            '    });',
            '});'
        ].join('\n');
        expect(findTestLineInText(sample, 'reports duplicate when local idea shares imported idea name')).toBe(1);
    });
});

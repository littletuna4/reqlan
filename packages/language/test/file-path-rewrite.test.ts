import { URI } from 'langium';
import { describe, expect, test } from 'vitest';
import { rewriteRelativePath } from '../src/file-path-rewrite.js';
import {
    findCommentPathReferencesInText,
    findImportPathReferencesInText,
    findPathReferencesInMovedFile
} from '../src/reqlan-path-references.js';

describe('rewriteRelativePath', () => {
    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    test('updates paths when a file moves to a sibling directory', () => {
        const oldFile = URI.parse('file:///workspace/ext/a/foo.rq');
        const newFile = URI.parse('file:///workspace/ext/c/foo.rq');
        expect(rewriteRelativePath('./other.rq', oldFile, newFile)).toBe('../a/other.rq');
    });

    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    test('leaves paths unchanged when the move does not affect resolution', () => {
        const oldFile = URI.parse('file:///workspace/ext/a/foo.rq');
        const newFile = URI.parse('file:///workspace/ext/a/bar.rq');
        expect(rewriteRelativePath('../shared/common.rq', oldFile, newFile)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    test('updates parent-relative imports after moving deeper', () => {
        const oldFile = URI.parse('file:///workspace/ext/foo.rq');
        const newFile = URI.parse('file:///workspace/ext/sub/foo.rq');
        expect(rewriteRelativePath('./other.rq', oldFile, newFile)).toBe('../other.rq');
    });
});

describe('findPathReferencesInMovedFile', () => {
    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    test('finds import and embedded paths in rq files', () => {
        const text = [
            'from "./imports.rq" import myidea',
            'see also ["../shared/base.rq"]'
        ].join('\n');
        const refs = findPathReferencesInMovedFile(text, true);
        expect(refs.map(ref => ref.path)).toEqual(['./imports.rq', '../shared/base.rq']);
    });

    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    test('finds rq comment paths in code files', () => {
        const text = '// built for rq:["./main.rq".myidea]';
        const refs = findPathReferencesInMovedFile(text, false);
        expect(refs).toHaveLength(1);
        expect(refs[0]?.path).toBe('./main.rq');
    });

    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    test('findImportPathReferencesInText captures quoted import ranges', () => {
        const refs = findImportPathReferencesInText('import "./ontology.rq" as ontology');
        expect(refs[0]?.path).toBe('./ontology.rq');
        expect(refs[0]?.range.start.character).toBe(7);
    });

    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    test('findCommentPathReferencesInText captures only the quoted path', () => {
        const refs = findCommentPathReferencesInText('// rq:["./main.rq".idea]');
        expect(refs[0]?.path).toBe('./main.rq');
        expect(refs[0]?.range.start.character).toBe(7);
    });
});

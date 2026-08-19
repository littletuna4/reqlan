import { URI } from 'langium';
import { describe, expect, test } from 'vitest';
import {
    buildInboundPathRewriteEdits,
    rewritePathToMovedTarget,
    rewriteRelativePath
} from '../src/file-path-rewrite.js';
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

describe('rewritePathToMovedTarget', () => {
    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".rename_file]
    test('updates inbound import path when the target file moves', () => {
        const referencing = URI.parse('file:///workspace/ext/a/main.rq');
        const oldTarget = URI.parse('file:///workspace/ext/a/foo.rq');
        const newTarget = URI.parse('file:///workspace/ext/b/foo.rq');
        expect(rewritePathToMovedTarget('./foo.rq', referencing, oldTarget, newTarget)).toBe('../b/foo.rq');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
    test('preserves extensionless inbound paths', () => {
        const referencing = URI.parse('file:///workspace/ext/a/main.rq');
        const oldTarget = URI.parse('file:///workspace/ext/a/foo.rq');
        const newTarget = URI.parse('file:///workspace/ext/b/foo.rq');
        expect(rewritePathToMovedTarget('./foo', referencing, oldTarget, newTarget)).toBe('../b/foo');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
    test('ignores paths that do not resolve to the moved target', () => {
        const referencing = URI.parse('file:///workspace/ext/a/main.rq');
        const oldTarget = URI.parse('file:///workspace/ext/a/foo.rq');
        const newTarget = URI.parse('file:///workspace/ext/b/foo.rq');
        expect(rewritePathToMovedTarget('./other.rq', referencing, oldTarget, newTarget)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
    test('buildInboundPathRewriteEdits quotes replacement paths', () => {
        const referencing = URI.parse('file:///workspace/ext/a/main.rq');
        const oldTarget = URI.parse('file:///workspace/ext/a/foo.rq');
        const newTarget = URI.parse('file:///workspace/ext/b/foo.rq');
        const edits = buildInboundPathRewriteEdits(
            findImportPathReferencesInText('from "./foo.rq" import x'),
            referencing,
            oldTarget,
            newTarget,
            (_path, newPath) => JSON.stringify(newPath)
        );
        expect(edits).toHaveLength(1);
        expect(edits[0]?.newText).toBe('"../b/foo.rq"');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
    test('rewrites inbound comment paths when the target rq file moves', () => {
        const referencing = URI.parse('file:///workspace/src/app.ts');
        const oldTarget = URI.parse('file:///workspace/ext/a/foo.rq');
        const newTarget = URI.parse('file:///workspace/ext/b/foo.rq');
        const edits = buildInboundPathRewriteEdits(
            findCommentPathReferencesInText('// rq:["../ext/a/foo.rq".alpha]'),
            referencing,
            oldTarget,
            newTarget,
            (_path, newPath) => JSON.stringify(newPath)
        );
        expect(edits).toHaveLength(1);
        expect(edits[0]?.newText).toBe('"../ext/b/foo.rq"');
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

    // rq:["../../../reqlan rq/language/syntax.rq".string_and_reference_apostrophes]
    test('finds single-quoted import and embedded paths in rq files', () => {
        const text = [
            "from './imports.rq' import myidea",
            "see also ['../shared/base.rq']"
        ].join('\n');
        const refs = findPathReferencesInMovedFile(text, true);
        expect(refs.map(ref => ref.path)).toEqual(['./imports.rq', '../shared/base.rq']);
    });

    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    // rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
    test('finds rq comment paths in code files', () => {
        const text = '// built for rq:["./main.rq".myidea]';
        const refs = findPathReferencesInMovedFile(text, false);
        expect(refs).toHaveLength(1);
        expect(refs[0]?.path).toBe('./main.rq');
        expect(refs[0]?.idea).toBe('myidea');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
    test('finds comment paths in moved rq files together with imports', () => {
        const text = [
            'from "./imports.rq" import myidea',
            '// rq:["../shared/base.rq".seed]'
        ].join('\n');
        const refs = findPathReferencesInMovedFile(text, true);
        expect(refs.map(ref => ref.path)).toEqual(['./imports.rq', '../shared/base.rq']);
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

import { describe, expect, test } from 'vitest';
import { resolveReferencedFilePath } from '../src/core/file-reference-resolve.js';

describe('resolveReferencedFilePath', () => {
    test('joins relative targets against the defining file folder', () => {
        expect(
            resolveReferencedFilePath(
                '../../../packages/extension/src/foo.ts',
                'reqlan rq/extension/module/activitybar.rq#loading_state'
            )
        ).toBe('packages/extension/src/foo.ts');
    });

    test('leaves absolute and scheme paths unchanged', () => {
        expect(resolveReferencedFilePath('/abs/foo.ts', 'a/b.rq#x')).toBe('/abs/foo.ts');
        expect(resolveReferencedFilePath('file:///tmp/x.ts', 'a/b.rq#x')).toBe('file:///tmp/x.ts');
        expect(resolveReferencedFilePath('C:\\Users\\tony\\reqlan\\foo.ts', 'a/b.rq#x')).toBe(
            'C:\\Users\\tony\\reqlan\\foo.ts'
        );
    });
});

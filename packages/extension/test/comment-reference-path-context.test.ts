/**
 * Extension host path context for aliased `rq:[…]` comment references.
 * rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_import_root_alias]
 * rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
 */
import { describe, expect, test } from 'vitest';
import { posix } from 'node:path';
import { presentCommentReferences } from '@reqlan/language';
import {
    clearCommentReferenceConfigCache,
    createCommentReferencePathContext
} from '../src/extension/comment-reference-path-context.js';

describe('comment reference import-root aliases', () => {
    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_import_root_alias]
    test('resolves @/ against the workspace folder for extension comment links', () => {
        clearCommentReferenceConfigCache();
        const context = createCommentReferencePathContext(
            '/workspace/pkg/src/app.ts',
            ['/workspace']
        );
        const target = posix.resolve('/workspace', 'shared/main.rq');
        const presented = presentCommentReferences(
            '// rq:["@/shared/main.rq".demo]\n',
            '/workspace/pkg/src',
            {
                exists: (absolutePath) => absolutePath === target,
                declaresIdea: () => true
            },
            posix.resolve,
            context
        );
        expect(presented.diagnostics).toHaveLength(0);
        expect(presented.links).toHaveLength(1);
        expect(presented.links[0]?.targetPath).toBe(target);
        expect(presented.links[0]?.idea).toBe('demo');
    });
});

/**
 * Filter for comment-file ignore-error Quick Fixes.
 * rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
 */
import { describe, expect, test } from 'vitest';
import {
    COMMENT_REFERENCE_MISSING_FILE,
    COMMENT_REFERENCE_MISSING_IDEA
} from '@reqlan/language';
import { isReqlanCommentDiagnostic } from '../src/extension/ignore-error-comment-filter.js';

describe('comment-file ignore-error diagnostic filter', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
    test('accepts reqlan source and comment-reference codes', () => {
        expect(isReqlanCommentDiagnostic({ source: 'reqlan' })).toBe(true);
        expect(isReqlanCommentDiagnostic({ code: COMMENT_REFERENCE_MISSING_FILE })).toBe(true);
        expect(isReqlanCommentDiagnostic({ code: COMMENT_REFERENCE_MISSING_IDEA })).toBe(true);
        expect(isReqlanCommentDiagnostic({ source: 'ts', code: 2304 })).toBe(false);
    });
});

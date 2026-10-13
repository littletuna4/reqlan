/**
 * rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
 */
import { describe, expect, test } from 'vitest';
import {
    COMMENT_REFERENCE_LANGUAGE_BLOCKLIST,
    isCommentReferenceHostLanguage
} from '../src/extension/comment-reference-languages.js';

describe('comment reference language blocklist', () => {
    test('blocklist excludes reqlan and editor chrome', () => {
        expect(COMMENT_REFERENCE_LANGUAGE_BLOCKLIST).toContain('reqlan');
        expect(COMMENT_REFERENCE_LANGUAGE_BLOCKLIST).toContain('log');
        expect(COMMENT_REFERENCE_LANGUAGE_BLOCKLIST).toContain('git-commit');
        expect(isCommentReferenceHostLanguage('reqlan')).toBe(false);
        expect(isCommentReferenceHostLanguage('log')).toBe(false);
        expect(isCommentReferenceHostLanguage('typescript')).toBe(true);
        expect(isCommentReferenceHostLanguage('ruby')).toBe(true);
        expect(isCommentReferenceHostLanguage('plaintext')).toBe(true);
        expect(isCommentReferenceHostLanguage('yaml')).toBe(true);
    });
});

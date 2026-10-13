/**
 * Comment rq hosts are every language except this blocklist.
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference]
 * rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
 */
export const COMMENT_REFERENCE_LANGUAGE_BLOCKLIST = [
    /** Native `.rq` editing — comment-host path is for other languages. */
    'reqlan',
    /** Editor chrome / SCM / search buffers — not source. */
    'log',
    'search-result',
    'code-search-result',
    'github-issues',
    'scminput',
    'git-commit',
    'git-rebase'
] as const;

export function isCommentReferenceHostLanguage(languageId: string): boolean {
    return !COMMENT_REFERENCE_LANGUAGE_BLOCKLIST.some(blocked => blocked === languageId);
}

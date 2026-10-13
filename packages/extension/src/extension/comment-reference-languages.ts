/**
 * Host languages that may carry comment rq references.
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference]
 * rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".references_in_functional_code_comments]
 */
export const COMMENT_REFERENCE_LANGUAGES = [
    'python',
    'javascript',
    'typescript',
    'typescriptreact',
    'java',
    'go',
    'rust',
    'c',
    'cpp'
] as const;

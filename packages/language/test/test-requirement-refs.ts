/**
 * Helpers for rq: requirement comment references in test files.
 */
import { findCommentReferencesInText } from '../src/reqlan-comment-resolver.js';

export const RQ = {
    core: '../../../reqlan rq/development/core.rq',
    syntax: '../../../reqlan rq/language/syntax.rq',
    featuresSyntax: '../../../reqlan rq/extension/features-syntax.rq',
    commentRefs: '../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq',
    syntaxHighlighting: '../../../reqlan rq/extension/features-syntax-highlighting.rq'
} as const;

const TEST_DECLARATION_PATTERN = /^\s*test(?:\.(?:only|skip|todo|concurrent))?\(\s*['`]/;

export function findTestsMissingRequirementReferences(text: string): string[] {
    const lines = text.split(/\r?\n/);
    const missing: string[] = [];
    for (let index = 0; index < lines.length; index++) {
        if (!TEST_DECLARATION_PATTERN.test(lines[index]!)) {
            continue;
        }
        const nameMatch = /test(?:\.(?:only|skip|todo|concurrent))?\(\s*['`]([^'`]+)['`]/.exec(lines[index]!);
        if (!nameMatch) {
            continue;
        }
        let predecessor = index - 1;
        while (predecessor >= 0 && lines[predecessor]!.trim() === '') {
            predecessor--;
        }
        const referenceLine = predecessor >= 0 ? lines[predecessor]! : '';
        if (findCommentReferencesInText(referenceLine).length === 0) {
            missing.push(nameMatch[1]!);
        }
    }
    return missing;
}

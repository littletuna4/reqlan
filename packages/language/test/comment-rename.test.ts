import { describe, expect, test } from 'vitest';
import {
    findCommentIdeaRenameEdits,
    findCommentIdeaRenameMatches,
    ideaTokenRangeInCommentReference
} from '../src/reqlan-comment-rename.js';
import { findCommentReferencesInText } from '../src/reqlan-comment-resolver.js';

describe('comment idea rename', () => {
    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_rename]
    test('finds idea token range in qualified comment reference', () => {
        const text = '// rq:["./main.rq".alpha]';
        const [reference] = findCommentReferencesInText(text);
        expect(reference?.idea).toBe('alpha');
        const range = ideaTokenRangeInCommentReference(text, reference!);
        expect(text.slice(
            // reconstruct via line 0
            range!.start.character,
            range!.end.character
        )).toBe('alpha');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_rename]
    test('builds rename edits for matching comment idea tokens', () => {
        const text = [
            '// rq:["./main.rq".alpha]',
            '// rq:[beta]'
        ].join('\n');
        const edits = findCommentIdeaRenameEdits(text, 'alpha', 'alpha_renamed', {
            includePathless: false
        });
        expect(edits).toHaveLength(1);
        expect(edits[0]?.newText).toBe('alpha_renamed');
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_rename]
    test('matches pathless comment ideas when enabled', () => {
        const text = '// rq:[alpha]';
        const matches = findCommentIdeaRenameMatches(text, 'alpha', { includePathless: true });
        expect(matches).toHaveLength(1);
        expect(matches[0]?.idea).toBe('alpha');
    });
});

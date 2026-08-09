/**
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".wildcard_reference_highlighting]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".syntax_highlighting]
 * rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
 * rq:["../../../reqlan rq/language/syntax.rq".comments]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const grammarPath = join(dirname(fileURLToPath(import.meta.url)), '../syntaxes/reqlan.tmLanguage.json');

function loadGrammar(): {
    repository: Record<string, {
        match?: string;
        begin?: string;
        name?: string;
        patterns?: Array<{ include?: string; match?: string; begin?: string; name?: string }>;
    }>;
} {
    return JSON.parse(readFileSync(grammarPath, 'utf8'));
}

function firstMatch(repositoryKey: string): string {
    const grammar = loadGrammar();
    const entry = grammar.repository[repositoryKey];
    if (entry?.match) {
        return entry.match;
    }
    const nested = entry?.patterns?.find(pattern => typeof pattern.match === 'string')?.match;
    if (!nested) {
        throw new Error(`No match pattern for ${repositoryKey}`);
    }
    return nested;
}

describe('TextMate wildcard reference highlighting', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".wildcard_reference_highlighting]
    test('e2e: bracket wildcard path ref matches link scope and not block comment', () => {
        const grammar = loadGrammar();
        const bracket = firstMatch('bracket-references');
        const bracketRe = new RegExp(bracket);

        const samples = [
            '["../extension/**/*.rq".*_pane]',
            '["./modules/*.rq".import_*]',
            '["../mod/**/*.rq".*webview*]',
            '["./file.rq".exact_idea]'
        ];
        for (const sample of samples) {
            expect(bracketRe.test(sample), sample).toBe(true);
        }

        const blockInner = grammar.repository['block-inner']?.patterns?.map(p => p.include) ?? [];
        expect(blockInner.indexOf('#bracket-references')).toBeLessThan(blockInner.indexOf('#comments'));

        const commentBegin = grammar.repository.comments?.patterns?.find(
            (pattern: { begin?: string; name?: string }) => pattern.name === 'comment.block.reqlan' || Boolean(pattern.begin?.includes('*'))
        )?.begin;
        expect(commentBegin).toContain('(?!\\*/)');

        // Empty recursive-glob segment must not be a block-comment begin.
        const beginRe = new RegExp(commentBegin!);
        expect(beginRe.test('/**/')).toBe(false);
        expect(beginRe.test('/* note */')).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".wildcard_reference_highlighting]
    test('wikilink path + wildcard idea is a dedicated link pattern', () => {
        const grammar = loadGrammar();
        const wikiPatterns = grammar.repository.wikilinks?.patterns ?? [];
        const pathWiki = wikiPatterns.find(pattern => pattern.match?.includes('path') || pattern.match?.includes('\\*'));
        expect(pathWiki?.match).toBeTruthy();
        const wikiRe = new RegExp(pathWiki!.match!);
        expect(wikiRe.test('[["../mods/*.rq".widget_*|widgets]]')).toBe(true);
    });
});

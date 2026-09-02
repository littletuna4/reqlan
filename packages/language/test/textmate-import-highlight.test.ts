/**
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".import_statement_highlighting]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".syntax_highlighting]
 * rq:["../../../reqlan rq/language/imports.rq".import_keywords]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const grammarPath = join(dirname(fileURLToPath(import.meta.url)), '../syntaxes/reqlan.tmLanguage.json');

interface TmPattern {
    match?: string;
    begin?: string;
    end?: string;
    name?: string;
    patterns?: TmPattern[];
    beginCaptures?: Record<string, { name?: string }>;
}

function loadImportKeywords(): TmPattern {
    const grammar = JSON.parse(readFileSync(grammarPath, 'utf8')) as {
        repository: Record<string, TmPattern>;
    };
    const entry = grammar.repository['import-keywords'];
    if (!entry) {
        throw new Error('Missing import-keywords repository entry');
    }
    return entry;
}

describe('TextMate import statement highlighting', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".import_statement_highlighting]
    test('e2e: from-import line scopes path and import keyword', () => {
        const entry = loadImportKeywords();
        const fromRule = entry.patterns?.find(pattern => pattern.begin?.includes('\\b(from)\\b'));
        expect(fromRule?.name).toBe('meta.import.reqlan');
        expect(fromRule?.end).toBe('$');
        expect(fromRule?.beginCaptures?.['2']?.name).toBe('keyword.control.reqlan');

        const nested = fromRule?.patterns ?? [];
        expect(nested.some(pattern => pattern.name === 'string.quoted.reqlan')).toBe(true);
        expect(nested.some(pattern => pattern.match?.includes('import') && pattern.name === 'keyword.control.reqlan')).toBe(true);
        expect(nested.some(pattern => pattern.name === 'variable.other.import.reqlan')).toBe(true);

        // Must not use a short leading keyword match that steals the path.
        expect(entry.patterns?.some(pattern =>
            typeof pattern.match === 'string' && pattern.match.includes('(from|import)')
        )).toBe(false);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".import_statement_highlighting]
    test('e2e: namespace import line scopes path and as', () => {
        const entry = loadImportKeywords();
        const importRule = entry.patterns?.find(pattern => pattern.begin?.includes('\\b(import)\\b'));
        expect(importRule?.name).toBe('meta.import.reqlan');
        expect(importRule?.end).toBe('$');
        expect(importRule?.beginCaptures?.['2']?.name).toBe('keyword.control.reqlan');

        const nested = importRule?.patterns ?? [];
        expect(nested.some(pattern => pattern.name === 'string.quoted.reqlan')).toBe(true);
        expect(nested.some(pattern => pattern.match === '\\b(as)\\b' && pattern.name === 'keyword.control.reqlan')).toBe(true);
    });
});

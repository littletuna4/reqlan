/**
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { editorDocumentLinks } from '../src/extension/editor-link-activation.js';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function wordPatternSource(): string {
    const text = readFileSync(join(extensionRoot, 'language-configuration.json'), 'utf8');
    const match = text.match(/"wordPattern":\s*"((?:\\.|[^"\\])*)"/);
    if (!match) {
        throw new Error('wordPattern missing from language-configuration.json');
    }
    return JSON.parse(`"${match[1]}"`) as string;
}

/** Same scan the editor uses: the match that contains the character index. */
function wordAt(text: string, index: number): string | undefined {
    const wordDefinition = new RegExp(wordPatternSource(), 'g');
    let best: string | undefined;
    let match: RegExpExecArray | null;
    while ((match = wordDefinition.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (start <= index && index < end) {
            best = match[0];
        }
        if (start > index) {
            break;
        }
        if (wordDefinition.lastIndex === match.index) {
            wordDefinition.lastIndex += 1;
        }
    }
    return best;
}

describe('editor reference activation', () => {
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
    test('keeps web URL and command document links', () => {
        const links = editorDocumentLinks([
            { target: { scheme: 'file' } },
            { target: { scheme: 'command' } },
            { target: { scheme: 'http' } },
            { target: { scheme: 'https' } },
            {}
        ]);
        expect(links.map(link => link.target?.scheme)).toEqual(['command', 'http', 'https']);
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
    test('editor words are identifiers; reference tokens come from the parser', () => {
        const idea = 'see [idea] next';
        expect(wordAt(idea, idea.indexOf('idea'))).toBe('idea');
        expect(wordAt(idea, idea.indexOf('next'))).toBe('next');

        const fileRef = '["./dir/file.rq".idea_name]';
        expect(wordAt(fileRef, fileRef.indexOf('file'))).toBe('file');
        expect(wordAt(fileRef, fileRef.indexOf('idea_name'))).toBe('idea_name');
        expect(wordAt(fileRef, fileRef.indexOf('dir'))).toBe('dir');

        const line =
            '["../core_analysis/rust_port.rq".lexer_rust] / ["../core_analysis/rust_port.rq".parser_rust]';
        expect(wordAt(line, line.indexOf('lexer_rust'))).toBe('lexer_rust');
        expect(wordAt(line, line.indexOf('parser_rust'))).toBe('parser_rust');
        expect(wordAt(line, line.indexOf('core_analysis'))).toBe('core_analysis');
        expect(wordAt(line, line.indexOf('".lexer'))).toBeUndefined();

        expect(wordAt('idea-name', 5)).toBe('idea-name');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_goto_definition_speed]
    test('go-to-definition does not send the buffer', () => {
        const folder = readFileSync(
            join(extensionRoot, 'src/extension/register-folder-reference-handling.ts'),
            'utf8'
        );
        const wildcard = readFileSync(
            join(extensionRoot, 'src/extension/register-wildcard-reference-handling.ts'),
            'utf8'
        );
        const main = readFileSync(join(extensionRoot, 'src/extension/main.ts'), 'utf8');
        expect(folder).not.toContain('provideDefinition');
        expect(folder).not.toContain('getText()');
        expect(wildcard).not.toContain('provideDefinition');
        expect(wildcard).not.toContain('getText()');
        expect(main).not.toContain('withFolderReferenceMiddleware');
        expect(main).not.toContain('withWildcardReferenceMiddleware');
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resting_underline]
    test('comment injection link scope includes markup.underline', () => {
        const grammar = JSON.parse(readFileSync(
            join(extensionRoot, 'grammars/reqlan-comment.injection.json'),
            'utf8'
        )) as { patterns: Array<{ name?: string }> };
        expect(grammar.patterns[0]?.name).toBe('meta.link.reqlan markup.underline');
    });

    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resting_underline]
    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('package.json contributes comment.rq.injection', () => {
        const pkg = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8')) as {
            contributes: {
                grammars: Array<{
                    scopeName?: string;
                    injectTo?: string[];
                    path?: string;
                }>;
            };
        };
        const injection = pkg.contributes.grammars.find(
            grammar => grammar.scopeName === 'comment.rq.injection'
        );
        expect(injection?.path).toBe('./syntaxes/reqlan-comment.injection.json');
        expect(injection?.injectTo).toEqual([
            'source.python',
            'source.js',
            'source.ts',
            'source.tsx',
            'source.java',
            'source.go',
            'source.rust',
            'source.c',
            'source.cpp'
        ]);
    });
});

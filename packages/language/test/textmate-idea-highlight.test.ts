/**
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".same_line_named_block_highlighting]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".syntax_highlighting]
 * rq:["../../../reqlan rq/language/syntax.rq".block_idea]
 * rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
 * rq:["../../../reqlan rq/language/syntax-edge-cases.rq".nested_curly_braces]
 * rq:["../../../reqlan rq/language/syntax-edge-cases.rq".one_liner_curly_brace_context]
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import {
    createReqlanServices,
    isIdea,
    isIdeaSet,
    isOneLinerIdea,
    type Model
} from '@reqlan/language';
import { INITIAL, type IGrammar } from 'vscode-textmate';
import { loadReqlanTextMateGrammar, reqlanTextMateGrammarPath } from './load-textmate-grammar.js';

const grammarPath = reqlanTextMateGrammarPath;

const IDEA_NAME_SCOPE = 'entity.name.type.idea.reqlan';
const IDEASET_NAME_SCOPE = 'entity.name.type.namespace.reqlan';

interface TmPattern {
    match?: string;
    begin?: string;
    end?: string;
    include?: string;
    patterns?: TmPattern[];
}

interface LoadedGrammarFile {
    patterns: TmPattern[];
    repository: Record<string, TmPattern>;
}

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;
let textMateGrammar: IGrammar;

function loadGrammarFile(): LoadedGrammarFile {
    return JSON.parse(readFileSync(grammarPath, 'utf8')) as LoadedGrammarFile;
}

function scopedNames(source: string, scope: string): string[] {
    const names: string[] = [];
    let ruleStack = INITIAL;
    for (const line of source.split(/\r?\n/)) {
        const { tokens, ruleStack: next } = textMateGrammar.tokenizeLine(line, ruleStack);
        ruleStack = next;
        for (const token of tokens) {
            if (!token.scopes.includes(scope)) {
                continue;
            }
            const text = line.slice(token.startIndex, token.endIndex).trim();
            if (text.length > 0) {
                names.push(text);
            }
        }
    }
    return names;
}

type ParserIdeaName = { name: string; kind: 'block' | 'oneliner' | 'ideaset' };

function parserIdeaNames(model: Model): ParserIdeaName[] {
    return model.elements.flatMap((element): ParserIdeaName[] => {
        if (isIdea(element)) {
            return [{ name: element.name, kind: 'block' }];
        }
        if (isOneLinerIdea(element)) {
            return [{ name: element.name, kind: 'oneliner' }];
        }
        if (isIdeaSet(element)) {
            return [{ name: element.name, kind: 'ideaset' }];
        }
        return [];
    });
}

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
    textMateGrammar = await loadReqlanTextMateGrammar();
});

describe('TextMate idea highlighting', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".same_line_named_block_highlighting]
    test('same-line named block rule closes on the opening line', () => {
        const grammar = loadGrammarFile();
        const sameLine = grammar.repository['top-level-same-line-idea-block'];
        expect(sameLine?.begin).toContain('(?=[^\\n]*\\}\\s*$)');
        expect(sameLine?.end).toBe('\\}(?=\\s*$)');

        const multiline = grammar.repository['top-level-idea-block'];
        expect(multiline?.end).toBe('^\\s*\\}');

        const rootIncludes = grammar.patterns.map(pattern => pattern.include);
        expect(rootIncludes.indexOf('#top-level-same-line-idea-block'))
            .toBeLessThan(rootIncludes.indexOf('#top-level-idea-block'));
        expect(rootIncludes.indexOf('#top-level-idea-block'))
            .toBeLessThan(rootIncludes.indexOf('#top-level-one-liner-idea'));
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".same_line_named_block_highlighting]
    test('e2e: same-line named braces do not swallow later ideas', async () => {
        const source = `mybadidea1 {}
mybadidea2 {hello}
myokidea1 {
  this is ok to text mate
}
mybadidea3
`;
        const document = await parse(source);
        expect(document.parseResult.parserErrors).toEqual([]);
        const parsed = parserIdeaNames(document.parseResult.value);
        expect(parsed).toEqual([
            { name: 'mybadidea1', kind: 'block' },
            { name: 'mybadidea2', kind: 'block' },
            { name: 'myokidea1', kind: 'block' },
            { name: 'mybadidea3', kind: 'oneliner' }
        ]);
        expect(scopedNames(source, IDEA_NAME_SCOPE)).toEqual(parsed.map(idea => idea.name));
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".same_line_named_block_highlighting]
    test('e2e: TextMate idea names match the Langium parse', async () => {
        const source = `one_liner_curly_brace_context this should {be acceptable} as well
empty_block {}
inline_block {hello}
resources {
    - Project site: {{SITE_URL}}
    - Docs: {{QUICKSTART_URL}}
}
name_only
with_body has text
`;
        const document = await parse(source);
        expect(document.parseResult.parserErrors).toEqual([]);
        const parsed = parserIdeaNames(document.parseResult.value);
        expect(parsed).toEqual([
            { name: 'one_liner_curly_brace_context', kind: 'oneliner' },
            { name: 'empty_block', kind: 'block' },
            { name: 'inline_block', kind: 'block' },
            { name: 'resources', kind: 'block' },
            { name: 'name_only', kind: 'oneliner' },
            { name: 'with_body', kind: 'oneliner' }
        ]);
        expect(scopedNames(source, IDEA_NAME_SCOPE)).toEqual(parsed.map(idea => idea.name));
        expect(scopedNames(source, IDEASET_NAME_SCOPE)).toEqual([]);
    });
});

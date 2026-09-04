/**
 * Merges Reqlan-specific TextMate patterns into the Langium-generated grammar.
 * Interacts with extension contributes.grammars and attribute label highlighting.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
 * rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const grammarPath = resolve(dirname(fileURLToPath(import.meta.url)), '../syntaxes/reqlan.tmLanguage.json');
const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));

grammar.repository ??= {};

const importPath = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
const id = '[A-Za-z_][\\w-]*';
const quotedName = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
const ideaName = `(?:(${id})|(${quotedName}))`;
// Matches WILDCARD_NAME: must contain * or ? (see reqlan.langium).
const wildcardName = '(?:\\*[\\w*?-]*|\\?[\\w*?-]*|[A-Za-z_][\\w-]*[*?][\\w*?-]*)';
const quotedPath = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
// Path + optional .ID / .WILDCARD_NAME segments (qualified + wildcard refs).
const bracketPathRef = `\\[(${quotedPath})(?:\\.(?:${id}|${wildcardName}))*\\]`;
const wikiPathRef = `\\[\\[(${quotedPath})(?:\\.(?:${id}|${wildcardName}))(\\|[^\\]]+)?\\]\\]`;
const bracketUrlRef = '\\[([A-Za-z][A-Za-z0-9+.-]*://[^\\]]+)\\]';

const removedRootIncludes = new Set([
    '#import-keywords',
    '#attributes',
    '#wikilinks',
    '#bracket-references',
    '#code-snippets',
    '#idea-definitions',
    '#top-level-same-line-idea-block',
    '#top-level-idea-block',
    '#top-level-one-liner-idea',
    '#top-level-ideaset'
]);

grammar.patterns = (grammar.patterns ?? []).filter(pattern => {
    if (typeof pattern.match === 'string' && /\\b\(as\|from\|import\)\\b/.test(pattern.match)) {
        return false;
    }
    if (pattern.include && removedRootIncludes.has(pattern.include)) {
        return false;
    }
    return true;
});

const rootPatterns = [
    { include: '#import-keywords' },
    { include: '#top-level-same-line-idea-block' },
    { include: '#top-level-idea-block' },
    { include: '#top-level-one-liner-idea' },
    { include: '#top-level-ideaset' }
];

for (const pattern of rootPatterns) {
    if (!grammar.patterns.some(entry => entry.include === pattern.include)) {
        grammar.patterns.push(pattern);
    }
}

// Line-scoped begin/end so the short `from|import` keyword match cannot steal the
// path / second keyword / alias from the rest of the import statement (white + link-only).
grammar.repository['import-keywords'] = {
    patterns: [
        {
            name: 'meta.import.reqlan',
            begin: '^(\\s*)\\b(from)\\b',
            beginCaptures: {
                '2': { name: 'keyword.control.reqlan' }
            },
            end: '$',
            patterns: [
                { match: importPath, name: 'string.quoted.reqlan' },
                {
                    match: '\\b(import|as)\\b',
                    name: 'keyword.control.reqlan'
                },
                {
                    match: `\\b(${id})\\b`,
                    name: 'variable.other.import.reqlan'
                }
            ]
        },
        {
            name: 'meta.import.reqlan',
            begin: '^(\\s*)\\b(import)\\b',
            beginCaptures: {
                '2': { name: 'keyword.control.reqlan' }
            },
            end: '$',
            patterns: [
                { match: importPath, name: 'string.quoted.reqlan' },
                {
                    match: '\\b(as)\\b',
                    name: 'keyword.control.reqlan'
                },
                {
                    match: `\\b(${id})\\b`,
                    name: 'variable.other.import.reqlan'
                }
            ]
        }
    ]
};

// String literals only appear in import paths and bracket-reference paths — not naked body prose.
grammar.repository.strings = {
    patterns: []
};

grammar.repository.comments = {
    patterns: [
        {
            name: 'comment.block.reqlan',
            // Reject empty slash-star-star-slash (recursive glob segment), same as ML_COMMENT lexer.
            begin: '/\\*(?!\\*/)',
            beginCaptures: {
                '0': { name: 'punctuation.definition.comment.reqlan' }
            },
            end: '\\*/',
            endCaptures: {
                '0': { name: 'punctuation.definition.comment.reqlan' }
            }
        },
        {
            begin: '(?<![:/])//',
            beginCaptures: {
                '0': { name: 'punctuation.definition.comment.reqlan' }
            },
            end: '(?=$)',
            name: 'comment.line.reqlan'
        }
    ]
};

// Comments at file root; body blocks include their own comment rules.
// Drop Langium's global quote rules — body prose uses naked quotes; strings only in import paths and bracket refs.
grammar.patterns = (grammar.patterns ?? []).filter(pattern => {
    if (pattern.include === '#comments' || pattern.include === '#strings') {
        return false;
    }
    if (pattern.name === 'string.quoted.double.reqlan' || pattern.name === 'string.quoted.single.reqlan') {
        return false;
    }
    if (typeof pattern.match === 'string' && /\\b\(as\|from\|import\)\\b/.test(pattern.match)) {
        return false;
    }
    return true;
});
grammar.patterns.unshift({ include: '#comments' });
grammar.patterns.unshift({ include: '#line-fences' });

grammar.repository.attributes = {
    name: 'meta.attribute.reqlan',
    match: '^\\s*(@)\\s*([A-Za-z_][\\w-]*)',
    captures: {
        '1': { name: 'punctuation.definition.attribute.reqlan' },
        '2': { name: 'entity.name.tag.attribute.reqlan' }
    }
};

grammar.repository.wikilinks = {
    patterns: [
        {
            name: 'markup.underline.link.reqlan',
            match: wikiPathRef,
            captures: {
                '1': { name: 'string.other.link.reqlan' },
                '2': { name: 'entity.name.tag.reference.reqlan' },
                '3': { name: 'string.other.link.title.reqlan' }
            }
        },
        {
            name: 'markup.underline.link.reqlan',
            match: '\\[\\[([^\\]|]+)(\\|[^\\]]+)?\\]\\]',
            captures: {
                '1': { name: 'entity.name.tag.reference.reqlan' },
                '2': { name: 'string.other.link.title.reqlan' }
            }
        }
    ]
};

grammar.repository['markdown-links'] = {
    name: 'markup.underline.link.reqlan',
    match: '\\[([^\\]]+)\\]\\(([^)]+)\\)',
    captures: {
        '1': { name: 'string.other.link.title.reqlan' },
        '2': { name: 'string.other.link.reqlan' }
    }
};

grammar.repository['idea-bracket-references'] = {
    name: 'markup.underline.link.reqlan',
    match: '\\[(?![#\\["])([^\\]]+)\\](?!\\()',
    captures: {
        '1': { name: 'entity.name.tag.reference.reqlan' }
    }
};

grammar.repository['bracket-references'] = {
    name: 'markup.underline.link.reqlan',
    match: bracketPathRef,
    captures: {
        '1': { name: 'string.other.link.reqlan' }
    }
};

grammar.repository['url-bracket-references'] = {
    name: 'markup.underline.link.reqlan',
    match: bracketUrlRef,
    captures: {
        '1': { name: 'string.other.link.reqlan' }
    }
};

grammar.repository['code-snippets'] = {
    name: 'markup.fenced_code.block.reqlan',
    begin: '^[ \\t]*```(\\w*)',
    end: '^[ \\t]*```',
    beginCaptures: {
        '1': { name: 'entity.name.type.language.reqlan' }
    }
};

// Consume complete same-line backticks and quotes before `#comments` so
// `/*` inside `@reqlan/*` or `"//…"` cannot open a comment (same as the lexer).
grammar.repository['inline-code'] = {
    name: 'markup.inline.raw.reqlan',
    match: '`[^`\\n]+`'
};

grammar.repository['line-fences'] = {
    patterns: [
        { include: '#inline-code' },
        { match: '"(?:[^"\\\\]|\\\\.)*"' },
        { match: '\'(?:[^\'\\\\]|\\\\.)*\'' }
    ]
};

function withLineFencesBeforeComments(patterns) {
    const next = (patterns ?? []).filter(pattern => (
        pattern.include !== '#inline-code' && pattern.include !== '#line-fences'
    ));
    const commentsAt = next.findIndex(pattern => pattern.include === '#comments');
    const fence = { include: '#line-fences' };
    if (commentsAt < 0) {
        return [fence, ...next];
    }
    return [
        ...next.slice(0, commentsAt),
        fence,
        ...next.slice(commentsAt)
    ];
}

grammar.repository['one-liner-body'] = {
    patterns: withLineFencesBeforeComments([
        { include: '#wikilinks' },
        { include: '#markdown-links' },
        { include: '#bracket-references' },
        { include: '#url-bracket-references' },
        { include: '#idea-bracket-references' },
        { include: '#code-snippets' },
        { include: '#comments' }
    ])
};

grammar.repository['block-inner'] = {
    patterns: withLineFencesBeforeComments([
        { include: '#attributes' },
        { include: '#wikilinks' },
        { include: '#markdown-links' },
        { include: '#bracket-references' },
        { include: '#url-bracket-references' },
        { include: '#idea-bracket-references' },
        { include: '#code-snippets' },
        { include: '#comments' },
        { include: '#named-same-line-block-item' },
        { include: '#named-block-item' },
        { include: '#named-list' },
        { include: '#nested-list' },
        { include: '#anonymous-block' }
    ])
};

const ideaNameCaptures = {
    '1': { name: 'entity.name.type.idea.reqlan' },
    '2': { name: 'entity.name.type.idea.reqlan' }
};

// Same-line closed named block (`name {}` / `name {hello}`).
// Lookahead requires `}` at end of this line so the rule cannot stay open and
// swallow later one-liners. Canonical: `{` immediately after a name is structural,
// and `}` at EOL with no unmatched prose `{` closes the block.
grammar.repository['top-level-same-line-idea-block'] = {
    begin: `^${ideaName}\\s*\\{(?=[^\\n]*\\}\\s*$)`,
    beginCaptures: ideaNameCaptures,
    end: '\\}(?=\\s*$)',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['top-level-idea-block'] = {
    begin: `^${ideaName}\\s*\\{`,
    beginCaptures: ideaNameCaptures,
    end: '^\\s*\\}',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['named-same-line-block-item'] = {
    begin: `^\\s+${ideaName}\\s*\\{(?=[^\\n]*\\}\\s*$)`,
    beginCaptures: ideaNameCaptures,
    end: '\\}(?=\\s*$)',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['named-block-item'] = {
    begin: `^\\s+${ideaName}\\s*\\{\\s*$`,
    beginCaptures: ideaNameCaptures,
    end: '^\\s*\\}',
    patterns: [
        { include: '#block-inner' }
    ]
};

// Attribute blocks and line-start anonymous blocks only — inline prose like `{such as this}` stays plain text.
grammar.repository['anonymous-block'] = {
    begin: '(?<=@[A-Za-z_][\\w-]*\\s*)\\{|^\\s*\\{',
    end: '\\}(?=\\s*$)',
    patterns: [
        { include: '#block-inner' }
    ]
};

// Named/nested lists require a newline after '(' (see NamedList / NestedList in reqlan.langium).
// Same-line prose like `sources (and contributions)` must stay unstyled body text.
grammar.repository['named-list'] = {
    begin: `^\\s*(${id})\\s*\\(\\s*$`,
    beginCaptures: {
        '1': { name: 'entity.name.tag.list.reqlan' }
    },
    end: '\\)',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['nested-list'] = {
    begin: '\\(\\s*$',
    end: '\\)',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['top-level-one-liner-idea'] = {
    patterns: [
        {
            match: `^(${id}|${quotedName})\\s*$`,
            captures: {
                '1': { name: 'entity.name.type.idea.reqlan' }
            }
        },
        {
            begin: `^(${id}|${quotedName})(\\s+)`,
            beginCaptures: {
                '1': { name: 'entity.name.type.idea.reqlan' }
            },
            end: '$',
            patterns: [
                { include: '#one-liner-body' }
            ]
        }
    ]
};

grammar.repository['top-level-ideaset'] = {
    patterns: [
        {
            match: `^(${id})\\s*\\(`,
            captures: {
                '1': { name: 'entity.name.type.namespace.reqlan' }
            }
        },
        {
            match: `^(${quotedName})\\s*\\(`,
            captures: {
                '1': { name: 'entity.name.type.namespace.reqlan' }
            }
        }
    ]
};

delete grammar.repository['idea-definitions'];

writeFileSync(grammarPath, `${JSON.stringify(grammar, null, 2)}\n`);

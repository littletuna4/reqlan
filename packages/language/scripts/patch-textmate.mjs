/**
 * Merges Reqlan-specific TextMate patterns into the Langium-generated grammar.
 * Interacts with extension contributes.grammars and attribute label highlighting.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const grammarPath = resolve(dirname(fileURLToPath(import.meta.url)), '../syntaxes/reqlan.tmLanguage.json');
const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));

grammar.repository ??= {};

const importPath = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
const id = '[A-Za-z_]\\w*';
const quotedName = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
const ideaName = `(?:(${id})|(${quotedName}))`;

const removedRootIncludes = new Set([
    '#import-keywords',
    '#attributes',
    '#wikilinks',
    '#bracket-references',
    '#code-snippets',
    '#idea-definitions',
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
    { include: '#top-level-idea-block' },
    { include: '#top-level-one-liner-idea' },
    { include: '#top-level-ideaset' }
];

for (const pattern of rootPatterns) {
    if (!grammar.patterns.some(entry => entry.include === pattern.include)) {
        grammar.patterns.push(pattern);
    }
}

grammar.repository['import-keywords'] = {
    patterns: [
        {
            match: '^(\\s*)\\b(from|import)\\b',
            captures: {
                '2': { name: 'keyword.control.reqlan' }
            }
        },
        {
            match: `^(\\s*from\\b\\s+)(${importPath})(\\s+\\bimport\\b)`,
            captures: {
                '2': { name: 'string.quoted.reqlan' }
            }
        },
        {
            match: `^(\\s*import\\b\\s+)(${importPath})(\\s+\\b(as)\\b)`,
            captures: {
                '2': { name: 'string.quoted.reqlan' },
                '3': { name: 'keyword.control.reqlan' }
            }
        },
        {
            match: `^(\\s*from\\b\\s+${importPath}\\s+\\bimport\\b\\s+\\w+\\s+)\\b(as)\\b`,
            captures: {
                '2': { name: 'keyword.control.reqlan' }
            }
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
            begin: '/\\*(?!/)',
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

grammar.repository.attributes = {
    name: 'meta.attribute.reqlan',
    match: '^\\s*(@)\\s*([A-Za-z_]\\w*)',
    captures: {
        '1': { name: 'punctuation.definition.attribute.reqlan' },
        '2': { name: 'entity.name.tag.attribute.reqlan' }
    }
};

grammar.repository.wikilinks = {
    name: 'markup.underline.link.reqlan',
    match: '\\[\\[([^\\]|]+)(\\|[^\\]]+)?\\]\\]',
    captures: {
        '1': { name: 'entity.name.tag.reference.reqlan' },
        '2': { name: 'string.other.link.title.reqlan' }
    }
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
    match: '\\[(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')(?:\\.[A-Za-z_]\\w*)*\\]',
    captures: {
        '1': { name: 'string.other.link.reqlan' }
    }
};

grammar.repository['code-snippets'] = {
    name: 'markup.fenced_code.block.reqlan',
    begin: '```(\\w*)',
    end: '```',
    beginCaptures: {
        '1': { name: 'entity.name.type.language.reqlan' }
    }
};

grammar.repository['one-liner-body'] = {
    patterns: [
        { include: '#comments' },
        { include: '#wikilinks' },
        { include: '#markdown-links' },
        { include: '#idea-bracket-references' },
        { include: '#bracket-references' },
        { include: '#code-snippets' }
    ]
};

grammar.repository['block-inner'] = {
    patterns: [
        { include: '#comments' },
        { include: '#attributes' },
        { include: '#wikilinks' },
        { include: '#markdown-links' },
        { include: '#idea-bracket-references' },
        { include: '#bracket-references' },
        { include: '#code-snippets' },
        { include: '#named-block-item' },
        { include: '#named-list' },
        { include: '#nested-list' },
        { include: '#anonymous-block' }
    ]
};

grammar.repository['top-level-idea-block'] = {
    begin: `^${ideaName}\\s*\\{`,
    beginCaptures: {
        '1': { name: 'entity.name.type.idea.reqlan' },
        '2': { name: 'entity.name.type.idea.reqlan' }
    },
    end: '\\}',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['named-block-item'] = {
    begin: `^\\s+${ideaName}\\s*\\{`,
    beginCaptures: {
        '1': { name: 'entity.name.type.idea.reqlan' },
        '2': { name: 'entity.name.type.idea.reqlan' }
    },
    end: '\\}',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['anonymous-block'] = {
    begin: '\\{',
    end: '\\}',
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

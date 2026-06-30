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

const importPath = '(?:"(?:[^"\\\\]|\\\\.)*")';
const id = '[A-Za-z_]\\w*';
const quotedName = '"(?:[^"\\\\]|\\\\.)*"';
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
            match: `^(\\s*from\\b\\s+${importPath}\\s+)\\b(import)\\b`,
            captures: {
                '2': { name: 'keyword.control.reqlan' }
            }
        },
        {
            match: `^(\\s*import\\b\\s+${importPath}\\s+)\\b(as)\\b`,
            captures: {
                '2': { name: 'keyword.control.reqlan' }
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

grammar.repository.attributes = {
    name: 'meta.attribute.reqlan',
    match: '\\s*(@)\\s*([A-Za-z_]\\w*)',
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

grammar.repository['bracket-references'] = {
    name: 'markup.underline.link.reqlan',
    match: '\\[("(?:[^"\\\\]|\\\\.)*")(?:\\.[A-Za-z_]\\w*)*\\]',
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

grammar.repository['block-inner'] = {
    patterns: [
        { include: '#comments' },
        { include: '#attributes' },
        { include: '#wikilinks' },
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

grammar.repository['named-list'] = {
    begin: `^\\s*(${id})\\s*\\(`,
    beginCaptures: {
        '1': { name: 'entity.name.tag.list.reqlan' }
    },
    end: '\\)',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['nested-list'] = {
    begin: '\\(',
    end: '\\)',
    patterns: [
        { include: '#block-inner' }
    ]
};

grammar.repository['top-level-one-liner-idea'] = {
    patterns: [
        {
            match: `^(${id})(\\s+)(?!\\{)(?!\\()`,
            captures: {
                '1': { name: 'entity.name.type.idea.reqlan' }
            }
        },
        {
            match: `^(${quotedName})(\\s+)(?!\\{)(?!\\()`,
            captures: {
                '1': { name: 'entity.name.type.idea.reqlan' }
            }
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

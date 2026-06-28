/**
 * Merges Reqlan-specific TextMate patterns into the Langium-generated grammar.
 * Interacts with extension contributes.grammars and attribute label highlighting.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const grammarPath = resolve(dirname(fileURLToPath(import.meta.url)), '../syntaxes/reqlan.tmLanguage.json');
const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'));

grammar.patterns ??= [];
grammar.repository ??= {};

grammar.patterns = grammar.patterns.filter(
    pattern => !(typeof pattern.match === 'string' && /\\b\(as\|from\|import\)\\b/.test(pattern.match))
);

const extraPatterns = [
    { include: '#import-keywords' },
    { include: '#attributes' },
    { include: '#wikilinks' },
    { include: '#idea-definitions' }
];

for (const pattern of extraPatterns) {
    if (!grammar.patterns.some(entry => entry.include === pattern.include)) {
        grammar.patterns.push(pattern);
    }
}

const importPath = '(?:"(?:[^"\\\\]|\\\\.)*")';

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
    match: '(@)([A-Za-z_]\\w*)',
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

grammar.repository['idea-definitions'] = {
    patterns: [
        {
            name: 'entity.name.type.idea.reqlan',
            match: '^([A-Za-z_]\\w*)(\\s*\\{)'
        },
        {
            name: 'entity.name.type.idea.reqlan',
            match: '^("(?:[^"\\\\]|\\\\.)*")(\\s*\\{)'
        },
        {
            name: 'entity.name.type.idea.reqlan',
            match: '^([A-Za-z_]\\w*)(\\s+)(?!\\{)(?!\\()'
        },
        {
            name: 'entity.name.type.idea.reqlan',
            match: '^("(?:[^"\\\\]|\\\\.)*")(\\s+)(?!\\{)(?!\\()'
        }
    ]
};

writeFileSync(grammarPath, `${JSON.stringify(grammar, null, 2)}\n`);

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

const extraPatterns = [
    { include: '#attributes' },
    { include: '#wikilinks' },
    { include: '#idea-definitions' }
];

for (const pattern of extraPatterns) {
    if (!grammar.patterns.some(entry => entry.include === pattern.include)) {
        grammar.patterns.push(pattern);
    }
}

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
            match: '^(\\s*)([A-Za-z_]\\w*)(\\s*\\{)'
        },
        {
            name: 'entity.name.type.idea.reqlan',
            match: '^(\\s*)("(?:[^"\\\\]|\\\\.)*")(\\s*\\{)'
        }
    ]
};

writeFileSync(grammarPath, `${JSON.stringify(grammar, null, 2)}\n`);

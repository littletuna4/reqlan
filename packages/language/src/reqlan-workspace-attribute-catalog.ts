/**
 * Collects attribute keys and values from parsed workspace documents.
 */
import type { LangiumDocuments } from 'langium';
import { AstUtils } from 'langium';
import { isAttribute, isModel, isScalarValue, type Attribute } from './generated/ast.js';
import type { AttributeCatalog } from './reqlan-attribute-catalog.js';

export function collectWorkspaceAttributeCatalog(documents: LangiumDocuments): AttributeCatalog {
    const keys = new Set<string>();
    const valuesByKey = new Map<string, Set<string>>();
    for (const document of documents.all.toArray()) {
        const model = document.parseResult.value;
        if (!isModel(model)) {
            continue;
        }
        for (const attribute of AstUtils.streamAst(model).filter(isAttribute)) {
            keys.add(attribute.name);
            const values = valuesForAttribute(attribute);
            if (values.length === 0) {
                continue;
            }
            if (!valuesByKey.has(attribute.name)) {
                valuesByKey.set(attribute.name, new Set());
            }
            for (const value of values) {
                valuesByKey.get(attribute.name)!.add(value);
            }
        }
    }
    return {
        keys: [...keys].sort((left, right) => left.localeCompare(right)),
        valuesByKey: Object.fromEntries(
            [...valuesByKey.entries()].map(([key, values]) => [key, [...values].sort()])
        )
    };
}

function valuesForAttribute(attribute: Attribute): string[] {
    if (!attribute.value) {
        return [];
    }
    if (isScalarValue(attribute.value)) {
        const text = attribute.value.parts
            .map(part => typeof part === 'string' ? part : '')
            .join('')
            .trim();
        return text ? [text] : [];
    }
    if (attribute.value.$type === 'ListValue') {
        return attribute.value.items.flatMap(item => {
            if (item.$type === 'OneLinerListItem') {
                return item.body.content
                    .map(part => typeof part === 'string' ? part : '')
                    .join('')
                    .trim();
            }
            return [];
        }).filter(Boolean);
    }
    return [];
}

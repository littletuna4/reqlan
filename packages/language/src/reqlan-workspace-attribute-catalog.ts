/**
 * Collects attribute keys and values from parsed workspace documents.
 */
import type { LangiumDocuments } from 'langium';
import { AstUtils } from 'langium';
import {
    isAttribute,
    isBlockValue,
    isListValue,
    isModel,
    isScalarValue,
    type Attribute
} from './generated/ast.js';
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
        const text = normalizeCatalogText(attribute.value.$cstNode?.text)
            || inlineCatalogParts(attribute.value.parts);
        return text ? [text] : [];
    }
    if (isListValue(attribute.value)) {
        return attribute.value.items
            .map(item => normalizeCatalogText(item.$cstNode?.text))
            .filter(Boolean);
    }
    if (isBlockValue(attribute.value)) {
        const raw = attribute.value.$cstNode?.text ?? '';
        const inner = raw.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
        return inner ? [inner.replace(/\s+/g, ' ')] : [];
    }
    return [];
}

function normalizeCatalogText(text: string | undefined): string {
    return text?.replace(/\s+/g, ' ').trim() ?? '';
}

function inlineCatalogParts(parts: ReadonlyArray<unknown>): string {
    return parts
        .map(part => {
            if (typeof part === 'string') {
                return part;
            }
            if (!part || typeof part !== 'object') {
                return '';
            }
            const node = part as {
                text?: string;
                inlineCode?: string;
                $cstNode?: { text?: string };
            };
            if (typeof node.text === 'string' && node.text.length > 0) {
                return node.text;
            }
            if (typeof node.inlineCode === 'string' && node.inlineCode.length > 0) {
                return node.inlineCode;
            }
            return node.$cstNode?.text ?? '';
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
}

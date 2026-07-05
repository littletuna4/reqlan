import type { AstNode } from 'langium';
import {
    isFromImport,
    isQualifiedImport,
    type FromImportSpecifier,
    type Import
} from './generated/ast.js';

export interface ImportBinding {
    name: string;
    node: AstNode;
    property: 'alias' | 'idea';
}

export function specifierBindingName(specifier: FromImportSpecifier): string | undefined {
    return specifier.alias ?? specifier.idea.$refText;
}

export function importBindings(importDecl: Import): ImportBinding[] {
    if (isFromImport(importDecl)) {
        return importDecl.specifiers.flatMap(specifier => {
            const name = specifierBindingName(specifier);
            if (!name) {
                return [];
            }
            return [{
                name,
                node: specifier,
                property: specifier.alias ? 'alias' as const : 'idea' as const
            }];
        });
    }
    if (isQualifiedImport(importDecl)) {
        const name = importDecl.alias ?? importDecl.idea.$refText;
        if (!name) {
            return [];
        }
        return [{
            name,
            node: importDecl,
            property: importDecl.alias ? 'alias' : 'idea'
        }];
    }
    if (importDecl.alias) {
        return [{ name: importDecl.alias, node: importDecl, property: 'alias' }];
    }
    return [];
}

export function importedIdeaNames(importDecl: Import): string[] {
    if (isFromImport(importDecl)) {
        return importDecl.specifiers.map(specifier => specifier.idea.$refText);
    }
    if (isQualifiedImport(importDecl)) {
        return [importDecl.idea.$refText];
    }
    return [];
}

export function findFromImportSpecifierByBinding(
    imports: Import[],
    bindingName: string
): FromImportSpecifier | undefined {
    for (const importDecl of imports) {
        if (!isFromImport(importDecl)) {
            continue;
        }
        const specifier = importDecl.specifiers.find(
            entry => specifierBindingName(entry) === bindingName
        );
        if (specifier) {
            return specifier;
        }
    }
    return undefined;
}

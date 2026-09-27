/**
 * Shared helpers for the reference target union types.
 */
import { AstUtils, type Reference } from 'langium';
import {
    isFileReference,
    isFileSymbolReference,
    isLocalReference,
    isModel,
    isQualifiedReference,
    type IdeaDeclaration,
    type Import,
    type QualifiedReference,
    type ReferenceTarget
} from './generated/ast.js';
import { findNamespaceImportByAlias, importPathOf } from './reqlan-import-bindings.js';
import { peekResolvedRef } from './reqlan-reference-peek.js';
import { unquoteReqlanString } from './reqlan-quoted-strings.js';

export function referenceImport(target: ReferenceTarget): Reference<Import> | undefined {
    if (isQualifiedReference(target)) {
        return peekResolvedRef(target.path) || peekResolvedRef(target.qualifier)
            ? (target.path ?? target.qualifier)
            : undefined;
    }
    return undefined;
}

export function referenceIdea(target: ReferenceTarget): Reference<IdeaDeclaration> | undefined {
    if (isQualifiedReference(target) || isLocalReference(target)) {
        return target.idea;
    }
    return undefined;
}

export function referenceFilePath(target: ReferenceTarget): string | undefined {
    if (isFileReference(target) || isFileSymbolReference(target)) {
        return target.file;
    }
    if (isQualifiedReference(target)) {
        return qualifiedReferenceImportPath(target);
    }
    return undefined;
}

export function qualifiedReferenceImportPath(reference: QualifiedReference): string | undefined {
    const qualifierImport = peekResolvedRef(reference.qualifier);
    if (qualifierImport) {
        return importPathOf(qualifierImport);
    }
    const pathImport = peekResolvedRef(reference.path);
    if (pathImport) {
        return importPathOf(pathImport);
    }
    if (reference.qualifier?.$refText) {
        const model = AstUtils.getDocument(reference).parseResult.value;
        if (isModel(model)) {
            const importDecl = findNamespaceImportByAlias(model.imports, reference.qualifier.$refText);
            if (importDecl) {
                return importPathOf(importDecl);
            }
        }
    }
    if (reference.path?.$refText) {
        return unquoteReqlanString(reference.path.$refText);
    }
    return undefined;
}

export function isAnonymousQualifiedReference(reference: QualifiedReference): boolean {
    return reference.path !== undefined
        && peekResolvedRef(reference.path) === undefined
        && reference.qualifier === undefined;
}

export { unquoteReqlanString } from './reqlan-quoted-strings.js';

export interface ParsedMarkdownLink {
    label: string;
    target: string;
}

const MARKDOWN_LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;

export function parseMarkdownLink(raw: string): ParsedMarkdownLink | undefined {
    const match = MARKDOWN_LINK_PATTERN.exec(raw);
    if (!match) {
        return undefined;
    }
    return {
        label: match[1]!,
        target: match[2]!
    };
}

/**
 * Resolves bracket references to namespace-imported files (ideasets or external files).
 */
import type { CstNode, FileSystemProvider, LangiumDocuments } from 'langium';
import { AstUtils, GrammarUtils } from 'langium';
import { isIdea, isModel, isOneLinerIdea, type Import, type LocalReference, type QualifiedReference } from './generated/ast.js';
import { findNamespaceImportByAlias } from './reqlan-import-bindings.js';
import { bindingNameSourceRange, resolveImportedFileLink, type ResolvedFileLink } from './reqlan-file-link-resolver.js';
import type { PathResolveContext } from './reqlan-path-resolve.js';

export function namespaceImportBindingName(reference: LocalReference): string | undefined {
    if (reference.idea) {
        return reference.idea.$refText;
    }
    if (reference.ideaset) {
        return reference.ideaset.$refText;
    }
    return undefined;
}

export function isNamespaceImportOnlyReference(reference: LocalReference | QualifiedReference): boolean {
    if (reference.$type === 'QualifiedReference') {
        return reference.qualifier !== undefined
            && reference.path === undefined
            && reference.idea === undefined
            && reference.ideaset === undefined;
    }
    const bindingName = namespaceImportBindingName(reference);
    if (!bindingName) {
        return false;
    }
    const document = AstUtils.getDocument(reference);
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return false;
    }
    if (reference.idea?.ref) {
        return false;
    }
    if (reference.ideaset?.ref) {
        return false;
    }
    if (model.elements.some(element =>
        (isIdea(element) || isOneLinerIdea(element)) && element.name === bindingName
    )) {
        return false;
    }
    return findNamespaceImportByAlias(model.imports, bindingName) !== undefined;
}

export function resolveNamespaceImportReferenceLink(
    reference: LocalReference | QualifiedReference,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const document = AstUtils.getDocument(reference);
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return undefined;
    }
    const bindingName = reference.$type === 'QualifiedReference'
        ? reference.qualifier?.$refText
        : namespaceImportBindingName(reference);
    if (!bindingName) {
        return undefined;
    }
    const importDecl = reference.$type === 'QualifiedReference'
        ? reference.qualifier?.ref
        : findNamespaceImportByAlias(model.imports, bindingName);
    if (!importDecl || !isNamespaceImportBinding(importDecl, bindingName)) {
        return undefined;
    }
    const pathNode = referencePathNode(reference, importDecl);
    if (!pathNode) {
        return undefined;
    }
    return resolveImportedFileLink(
        document,
        documents,
        fileSystem,
        importDecl.path,
        bindingNameSourceRange(pathNode, bindingName),
        context
    );
}

function isNamespaceImportBinding(importDecl: Import, bindingName: string): boolean {
    return findNamespaceImportByAlias([importDecl], bindingName) !== undefined;
}

function referencePathNode(reference: LocalReference | QualifiedReference, importDecl: Import): CstNode | undefined {
    if (reference.$type === 'QualifiedReference') {
        return reference.qualifier?.$refNode
            ?? GrammarUtils.findNodeForProperty(reference.$cstNode, 'qualifier');
    }
    if (reference.idea?.$refNode) {
        return reference.idea.$refNode;
    }
    if (reference.ideaset?.$refNode) {
        return reference.ideaset.$refNode;
    }
    return GrammarUtils.findNodeForProperty(reference.$cstNode, reference.idea !== undefined ? 'idea' : 'ideaset');
}

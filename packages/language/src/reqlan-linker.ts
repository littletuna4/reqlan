/**
 * Links anonymous qualified import paths without requiring a matching import declaration,
 * and keeps bare namespace-alias references unlinked instead of reporting them as unresolved ideas.
 * rq:["../../../reqlan rq/language/imports.rq".import_namespace]
 * rq:["../../../reqlan rq/language/syntax.rq".attribute_namespacing]
 */
import type { AstNode, FileSystemProvider, LangiumDocument, LangiumDocuments, LinkingError, MultiReferenceItem, ReferenceInfo } from 'langium';
import { AstUtils, DefaultLinker, DocumentState, type DefaultMultiReference, type DefaultReference } from 'langium';
import {
    findDeclaredAttribute,
    ownerIsAttributeHost,
    unresolvedAttributeMessage
} from './reqlan-attribute-links.js';
import { isIdea, isIdeaSet, isLocalReference, isModel, isOneLinerIdea, isQualifiedReference } from './generated/ast.js';
import { isOpaqueFileReferencePath } from './reqlan-file-references.js';
import { findNamespaceImportByAlias } from './reqlan-import-bindings.js';
import { isResolvableImportPath } from './reqlan-imports.js';
import type { ReqlanServices } from './reqlan-module.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';
import { unquoteReqlanString } from './reqlan-references.js';

/** Marks a reference that resolves to a file rather than to an AST node. */
export const UnlinkedFileTarget = Symbol('UnlinkedFileTarget');

export class ReqlanLinker extends DefaultLinker {

    private readonly documents: LangiumDocuments;
    private readonly fileSystem: FileSystemProvider;
    private readonly services: ReqlanServices;

    constructor(services: ReqlanServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
        this.fileSystem = services.shared.workspace.FileSystemProvider;
        this.services = services;
    }

    protected override doLink(refInfo: ReferenceInfo, document: LangiumDocument): void {
        const missingAttribute = this.missingAttributeLink(refInfo, document);
        if (missingAttribute) {
            this.assignLinkingError(
                refInfo,
                document,
                unresolvedAttributeMessage(missingAttribute.owner, missingAttribute.attribute)
            );
            return;
        }
        if (this.isAnonymousImportPathReference(refInfo)) {
            const scope = this.scopeProvider.getScope(refInfo);
            if (scope.getElement(refInfo.reference.$refText)) {
                super.doLink(refInfo, document);
                return;
            }
            const path = unquoteReqlanString(refInfo.reference.$refText);
            if (isOpaqueFileReferencePath(path)) {
                return;
            }
            if (this.resolvesAnonymousImportPath(path, document)) {
                this.markUnlinked(refInfo, document);
                return;
            }
        }
        if (this.isNamespaceAliasReference(refInfo)) {
            this.markUnlinked(refInfo, document);
            return;
        }
        super.doLink(refInfo, document);
    }

    /**
     * `[alias]` on its own targets the imported file, not an idea inside it. The check stays syntactic
     * because reading `ref` here would resolve the reference and record the linking error we avoid.
     */
    private isNamespaceAliasReference(refInfo: ReferenceInfo): boolean {
        const container = refInfo.container;
        if (!isLocalReference(container)) {
            return false;
        }
        if (refInfo.property !== 'idea') {
            return false;
        }
        const model = AstUtils.getDocument(container).parseResult.value;
        if (!isModel(model)) {
            return false;
        }
        const name = refInfo.reference.$refText;
        if (model.elements.some(element =>
            (isIdea(element) || isOneLinerIdea(element) || isIdeaSet(element)) && element.name === name
        )) {
            return false;
        }
        return findNamespaceImportByAlias(model.imports, name) !== undefined;
    }

    protected override resolveReference(reference: DefaultReference, node: AstNode, property: string): AstNode | undefined {
        if ((reference as { _ref?: unknown })._ref === UnlinkedFileTarget) {
            return undefined;
        }
        // rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_hot_path]
        // Do not link, warn, or cache a failure before scopes exist. A later phase can still link.
        if (reference._ref === undefined && documentBelowComputedScopes(node)) {
            return undefined;
        }
        return super.resolveReference(reference, node, property);
    }

    protected override resolveMultiReference(
        reference: DefaultMultiReference,
        node: AstNode,
        property: string
    ): MultiReferenceItem[] {
        if (reference._items === undefined && documentBelowComputedScopes(node)) {
            return [];
        }
        return super.resolveMultiReference(reference, node, property);
    }

    private isAnonymousImportPathReference(refInfo: ReferenceInfo): boolean {
        return isQualifiedReference(refInfo.container)
            && refInfo.property === 'path'
            && refInfo.container.path === refInfo.reference;
    }

    private resolvesAnonymousImportPath(path: string, document: LangiumDocument): boolean {
        return isResolvableImportPath(
            path,
            document,
            this.documents,
            this.fileSystem,
            pathResolveContextFromServices(this.services)
        );
    }

    /**
     * `[idea.attribute]` with no such attribute on that idea.
     * Do not leave the second name for idea linking.
     * rq:["../../../reqlan rq/language/syntax.rq".attribute_namespacing]
     */
    private missingAttributeLink(
        refInfo: ReferenceInfo,
        document: LangiumDocument
    ): { owner: string; attribute: string } | undefined {
        const container = refInfo.container;
        if (!isQualifiedReference(container) || refInfo.property !== 'idea') {
            return undefined;
        }
        if (container.path || container.ideaset) {
            return undefined;
        }
        const owner = container.qualifier?.$refText;
        const attribute = refInfo.reference.$refText;
        if (!owner || !attribute) {
            return undefined;
        }
        const model = document.parseResult.value;
        if (!isModel(model) || !ownerIsAttributeHost(model, owner)) {
            return undefined;
        }
        if (findDeclaredAttribute(model, owner, attribute)) {
            return undefined;
        }
        return { owner, attribute };
    }

    private assignLinkingError(refInfo: ReferenceInfo, document: LangiumDocument, message: string): void {
        const ref = refInfo.reference;
        if ('_ref' in ref && ref._ref === undefined) {
            const error: LinkingError = { info: refInfo, message };
            ref._ref = error;
            document.references.push(ref);
        }
    }

    private markUnlinked(refInfo: ReferenceInfo, document: LangiumDocument): void {
        const ref = refInfo.reference;
        if ('_ref' in ref && ref._ref === undefined) {
            ref._ref = UnlinkedFileTarget;
            document.references.push(ref);
        }
    }
}

function documentBelowComputedScopes(node: AstNode): boolean {
    let current: AstNode = node;
    while (current.$container) {
        current = current.$container;
    }
    const document = current.$document;
    return document !== undefined && document.state < DocumentState.ComputedScopes;
}

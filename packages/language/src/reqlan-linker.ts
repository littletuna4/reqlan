/**
 * Links anonymous qualified import paths without requiring a matching import declaration,
 * and keeps bare namespace-alias references unlinked instead of reporting them as unresolved ideas.
 * rq:["../../../reqlan rq/language/imports.rq".import_namespace]
 */
import type { AstNode, FileSystemProvider, LangiumDocument, LangiumDocuments, ReferenceInfo } from 'langium';
import { AstUtils, DefaultLinker, type DefaultReference } from 'langium';
import { isLocalReference, isModel, isQualifiedReference } from './generated/ast.js';
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
        if (model.elements.some(element => element.name === name)) {
            return false;
        }
        return findNamespaceImportByAlias(model.imports, name) !== undefined;
    }

    protected override resolveReference(reference: DefaultReference, node: AstNode, property: string): AstNode | undefined {
        if ((reference as { _ref?: unknown })._ref === UnlinkedFileTarget) {
            return undefined;
        }
        return super.resolveReference(reference, node, property);
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

    private markUnlinked(refInfo: ReferenceInfo, document: LangiumDocument): void {
        const ref = refInfo.reference;
        if ('_ref' in ref && ref._ref === undefined) {
            ref._ref = UnlinkedFileTarget;
            document.references.push(ref);
        }
    }
}

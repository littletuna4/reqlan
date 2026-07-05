/**
 * Links anonymous qualified import paths without requiring a matching import declaration.
 */
import type { AstNode, FileSystemProvider, LangiumDocument, LangiumDocuments, ReferenceInfo } from 'langium';
import { DefaultLinker, type DefaultReference } from 'langium';
import { isQualifiedReference } from './generated/ast.js';
import { isResolvableImportPath } from './reqlan-imports.js';
import type { ReqlanServices } from './reqlan-module.js';
import { unquoteReqlanString } from './reqlan-references.js';

export const AnonymousImportPath = Symbol('AnonymousImportPath');

export class ReqlanLinker extends DefaultLinker {

    private readonly documents: LangiumDocuments;
    private readonly fileSystem: FileSystemProvider;

    constructor(services: ReqlanServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
        this.fileSystem = services.shared.workspace.FileSystemProvider;
    }

    protected override doLink(refInfo: ReferenceInfo, document: LangiumDocument): void {
        if (this.isAnonymousImportPathReference(refInfo)) {
            const scope = this.scopeProvider.getScope(refInfo);
            if (scope.getElement(refInfo.reference.$refText)) {
                super.doLink(refInfo, document);
                return;
            }
            if (this.resolvesAnonymousImportPath(refInfo, document)) {
                this.linkAnonymousImportPath(refInfo, document);
                return;
            }
        }
        super.doLink(refInfo, document);
    }

    protected override resolveReference(reference: DefaultReference, node: AstNode, property: string): AstNode | undefined {
        if ((reference as { _ref?: unknown })._ref === AnonymousImportPath) {
            return undefined;
        }
        return super.resolveReference(reference, node, property);
    }

    private isAnonymousImportPathReference(refInfo: ReferenceInfo): boolean {
        return isQualifiedReference(refInfo.container)
            && refInfo.property === 'path'
            && refInfo.container.path === refInfo.reference;
    }

    private resolvesAnonymousImportPath(refInfo: ReferenceInfo, document: LangiumDocument): boolean {
        const path = unquoteReqlanString(refInfo.reference.$refText);
        return isResolvableImportPath(path, document, this.documents, this.fileSystem);
    }

    private linkAnonymousImportPath(refInfo: ReferenceInfo, document: LangiumDocument): void {
        const ref = refInfo.reference;
        if ('_ref' in ref && ref._ref === undefined) {
            ref._ref = AnonymousImportPath;
            document.references.push(ref);
        }
    }
}

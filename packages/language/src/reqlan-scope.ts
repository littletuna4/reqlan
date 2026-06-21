/**
 * Publishes idea declarations for file-local and cross-file reference resolution.
 * Interacts with imports, wikilinks, and the global workspace index.
 */
import type { AstNodeDescription, LangiumDocument, ReferenceInfo } from 'langium';
import { AstUtils, DefaultScopeComputation, DefaultScopeProvider, StreamScope, UriUtils, stream, type Scope } from 'langium';
import {
    isIdea,
    isModel,
    isReferenceTarget,
    isSimpleIdea,
    type Model
} from './generated/ast.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanScopeComputation extends DefaultScopeComputation {

    override async collectExportedSymbols(document: LangiumDocument): Promise<AstNodeDescription[]> {
        const exports: AstNodeDescription[] = [];
        const model = document.parseResult.value;
        if (isModel(model)) {
            for (const element of model.elements) {
                if (isIdea(element) || isSimpleIdea(element)) {
                    this.addExportedSymbol(element, exports, document);
                }
            }
        }
        return exports;
    }
}

export class ReqlanScopeProvider extends DefaultScopeProvider {

    protected readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];

    constructor(services: ReqlanServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
    }

    override getScope(context: ReferenceInfo): Scope {
        const container = context.container;
        if (isReferenceTarget(container) && context.property === 'idea') {
            if (container.qualifier) {
                const importScope = this.scopeForImportAlias(container.qualifier, AstUtils.getDocument(container));
                if (importScope) {
                    return importScope;
                }
            }
            if (container.path) {
                const pathScope = this.scopeForImportPath(container.path, AstUtils.getDocument(container));
                if (pathScope) {
                    return pathScope;
                }
            }
        }
        return super.getScope(context);
    }

    private scopeForImportAlias(alias: string, document: LangiumDocument): Scope | undefined {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return undefined;
        }
        const importDecl = model.imports.find(entry => entry.alias === alias);
        if (!importDecl) {
            return undefined;
        }
        return this.scopeForImportPath(importDecl.path, document);
    }

    private scopeForImportPath(path: string, document: LangiumDocument): Scope | undefined {
        const imported = this.findImportedDocument(path, document);
        if (!imported) {
            return undefined;
        }
        const model = imported.parseResult.value;
        if (!isModel(model)) {
            return undefined;
        }
        const descriptions = model.elements
            .filter(element => isIdea(element) || isSimpleIdea(element))
            .map(idea => this.descriptions.createDescription(idea, idea.name, imported));
        return new StreamScope(stream(descriptions));
    }

    private findImportedDocument(path: string, document: LangiumDocument): LangiumDocument | undefined {
        const uri = UriUtils.resolvePath(UriUtils.dirname(document.uri), path);
        return this.documents.getDocument(uri);
    }
}

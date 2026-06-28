/**
 * Publishes idea declarations for file-local and cross-file reference resolution.
 * Interacts with imports, wikilinks, and the global workspace index.
 */
import type { AstNodeDescription, LangiumDocument, ReferenceInfo } from 'langium';
import { AstUtils, DefaultScopeComputation, DefaultScopeProvider, StreamScope, stream, type Scope } from 'langium';
import {
    isFromImport,
    isIdea,
    isModel,
    isNamespaceImport,
    isQualifiedImport,
    isReferenceTarget,
    isSimpleIdea,
    type Import,
    type Model
} from './generated/ast.js';
import { findImportedDocument } from './reqlan-imports.js';
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
        if (isReferenceTarget(container)) {
            const document = AstUtils.getDocument(container);
            if (context.property === 'qualifier') {
                return this.scopeForNamedImports(document);
            }
            if (context.property === 'path') {
                return this.scopeForImportPaths(document);
            }
            if (context.property === 'idea') {
                const importDecl = container.qualifier?.ref ?? container.path?.ref;
                if (importDecl) {
                    const importScope = this.scopeForImportDeclaration(importDecl, document);
                    if (importScope) {
                        return importScope;
                    }
                }
                const aliasScope = this.scopeForImportAliasName(context.reference.$refText, document);
                if (aliasScope) {
                    return aliasScope;
                }
            }
        }
        return super.getScope(context);
    }

    private scopeForNamedImports(document: LangiumDocument): Scope {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return new StreamScope(stream([]));
        }
        const descriptions = model.imports
            .map(importDecl => {
                const alias = importAlias(importDecl);
                return alias ? this.descriptions.createDescription(importDecl, alias, document) : undefined;
            })
            .filter((description): description is AstNodeDescription => description !== undefined);
        return new StreamScope(stream(descriptions));
    }

    private scopeForImportPaths(document: LangiumDocument): Scope {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return new StreamScope(stream([]));
        }
        const descriptions = model.imports.map(importDecl =>
            this.descriptions.createDescription(importDecl, importDecl.path, document)
        );
        return new StreamScope(stream(descriptions));
    }

    private scopeForImportDeclaration(importDecl: Import, document: LangiumDocument): Scope | undefined {
        if (isFromImport(importDecl) || isQualifiedImport(importDecl)) {
            const imported = this.findImportedDocument(importDecl.path, document);
            if (!imported) {
                return undefined;
            }
            const target = importDecl.idea.ref;
            if (!target || !isIdea(target)) {
                return undefined;
            }
            const description = this.descriptions.createDescription(target, target.name, imported);
            return new StreamScope(stream([description]));
        }
        if (isNamespaceImport(importDecl)) {
            return this.scopeForImportPath(importDecl.path, document);
        }
        return undefined;
    }

    private scopeForImportAliasName(alias: string, document: LangiumDocument): Scope | undefined {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return undefined;
        }
        const importDecl = model.imports.find(entry => importAlias(entry) === alias);
        if (!importDecl) {
            return undefined;
        }
        return this.scopeForImportDeclaration(importDecl, document);
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
        return findImportedDocument(path, document, this.documents);
    }
}

function importAlias(entry: Import): string | undefined {
    return entry.alias;
}

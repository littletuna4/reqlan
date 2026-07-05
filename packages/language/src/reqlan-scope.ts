/**
 * Publishes idea and ideaset declarations for file-local and cross-file reference resolution.
 */
import type { AstNodeDescription, LangiumDocument, ReferenceInfo } from 'langium';
import { AstUtils, DefaultScopeComputation, DefaultScopeProvider, StreamScope, stream, type Scope } from 'langium';
import {
    isFromImport,
    isFromImportSpecifier,
    isIdea,
    isIdeaSet,
    isLocalReference,
    isModel,
    isNamespaceImport,
    isOneLinerIdea,
    isQualifiedImport,
    isQualifiedReference,
    type FromImportSpecifier,
    type Import,
    type Model,
    type QualifiedReference
} from './generated/ast.js';
import { findFromImportSpecifierByBinding, specifierBindingName } from './reqlan-import-bindings.js';
import { findImportedDocument } from './reqlan-imports.js';
import type { ReqlanServices } from './reqlan-module.js';
import { qualifiedReferenceImportPath } from './reqlan-references.js';

export class ReqlanScopeComputation extends DefaultScopeComputation {

    override async collectExportedSymbols(document: LangiumDocument): Promise<AstNodeDescription[]> {
        const exports: AstNodeDescription[] = [];
        const model = document.parseResult.value;
        if (isModel(model)) {
            for (const element of model.elements) {
                if (isIdea(element) || isOneLinerIdea(element) || isIdeaSet(element)) {
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
        if ((isFromImportSpecifier(container) || isQualifiedImport(container)) && context.property === 'idea') {
            const document = AstUtils.getDocument(container);
            const path = isFromImportSpecifier(container) ? container.$container.path : container.path;
            const importScope = this.scopeForImportPath(path, document);
            if (importScope) {
                return importScope;
            }
            return new StreamScope(stream([]));
        }
        if (isQualifiedReference(container)) {
            const document = AstUtils.getDocument(container);
            if (context.property === 'qualifier') {
                return this.scopeForNamedImports(document);
            }
            if (context.property === 'path') {
                return this.scopeForImportPaths(document);
            }
            if (context.property === 'ideaset') {
                const importedDocument = this.documentForQualifiedReference(container, document);
                if (importedDocument) {
                    return this.scopeForIdeasets(importedDocument);
                }
                return this.scopeForIdeasets(document);
            }
            if (context.property === 'idea') {
                const importDecl = container.qualifier?.ref ?? container.path?.ref;
                if (importDecl) {
                    const importScope = this.scopeForImportDeclaration(importDecl, document);
                    if (importScope) {
                        return importScope;
                    }
                }
                const path = qualifiedReferenceImportPath(container);
                if (path) {
                    const importScope = this.scopeForImportPath(path, document);
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
        if (isLocalReference(container)) {
            const document = AstUtils.getDocument(container);
            if (context.property === 'ideaset') {
                return this.scopeForIdeasets(document);
            }
        }
        return super.getScope(context);
    }

    private scopeForIdeasets(document: LangiumDocument): Scope {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return new StreamScope(stream([]));
        }
        const descriptions = model.elements
            .filter(isIdeaSet)
            .map(ideaset => this.descriptions.createDescription(ideaset, ideaset.name, document));
        return new StreamScope(stream(descriptions));
    }

    private scopeForNamedImports(document: LangiumDocument): Scope {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return new StreamScope(stream([]));
        }
        const descriptions = model.imports.flatMap(importDecl => {
            if (isFromImport(importDecl)) {
                return importDecl.specifiers.flatMap(specifier => {
                    const alias = specifierBindingName(specifier);
                    return alias
                        ? [this.descriptions.createDescription(specifier, alias, document)]
                        : [];
                });
            }
            const alias = importAlias(importDecl);
            return alias ? [this.descriptions.createDescription(importDecl, alias, document)] : [];
        });
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

    private scopeForImportDeclaration(importDecl: Import | FromImportSpecifier, document: LangiumDocument): Scope | undefined {
        if (isFromImportSpecifier(importDecl)) {
            const imported = this.findImportedDocument(importDecl.$container.path, document);
            if (!imported) {
                return undefined;
            }
            const target = importDecl.idea.ref;
            if (!target || (!isIdea(target) && !isOneLinerIdea(target))) {
                return undefined;
            }
            const description = this.descriptions.createDescription(target, target.name, imported);
            return new StreamScope(stream([description]));
        }
        if (isFromImport(importDecl)) {
            const imported = this.findImportedDocument(importDecl.path, document);
            if (!imported) {
                return undefined;
            }
            const descriptions = importDecl.specifiers
                .map(specifier => specifier.idea.ref)
                .filter((target): target is NonNullable<typeof target> =>
                    target !== undefined && (isIdea(target) || isOneLinerIdea(target))
                )
                .map(target => this.descriptions.createDescription(target, target.name, imported));
            return new StreamScope(stream(descriptions));
        }
        if (isQualifiedImport(importDecl)) {
            const imported = this.findImportedDocument(importDecl.path, document);
            if (!imported) {
                return undefined;
            }
            const target = importDecl.idea.ref;
            if (!target || (!isIdea(target) && !isOneLinerIdea(target))) {
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
        const specifier = findFromImportSpecifierByBinding(model.imports, alias);
        if (specifier) {
            return this.scopeForImportDeclaration(specifier, document);
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
            .filter(element => isIdea(element) || isOneLinerIdea(element))
            .map(idea => this.descriptions.createDescription(idea, idea.name, imported));
        return new StreamScope(stream(descriptions));
    }

    private findImportedDocument(path: string, document: LangiumDocument): LangiumDocument | undefined {
        return findImportedDocument(path, document, this.documents);
    }

    private documentForQualifiedReference(
        reference: QualifiedReference,
        document: LangiumDocument
    ): LangiumDocument | undefined {
        const path = qualifiedReferenceImportPath(reference);
        if (!path) {
            return undefined;
        }
        return this.findImportedDocument(path, document);
    }
}

function importAlias(entry: Import): string | undefined {
    if (isFromImport(entry)) {
        return undefined;
    }
    return entry.alias;
}

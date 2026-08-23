/**
 * Publishes idea and ideaset declarations for file-local and cross-file reference resolution.
 * Local declarations are collected first; imports are consulted only when a name is not local.
 * rq:["../../../reqlan rq/language/syntax.rq".same_file_reference]
 * rq:["../../../reqlan rq/language/syntax.rq".reference_resolution_order]
 */
import type { AstNodeDescription, LangiumDocument, ReferenceInfo } from 'langium';
import { AstUtils, DefaultScopeComputation, DefaultScopeProvider, StreamScope, stream, type Scope } from 'langium';
import {
    isFromImport,
    isFromImportSpecifier,
    isIdeaDeclaration,
    isIdeaSet,
    isInvalidFromImport,
    isLocalReference,
    isModel,
    isNamespaceImport,
    isQualifiedImport,
    isQualifiedReference,
    type FromImportSpecifier,
    type IdeaSet,
    type Import,
    type Model,
    type QualifiedReference
} from './generated/ast.js';
import { findFromImportSpecifierByBinding, importPathOf, specifierBindingName } from './reqlan-import-bindings.js';
import { findImportedDocument } from './reqlan-imports.js';
import type { ReqlanServices } from './reqlan-module.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';
import { qualifiedReferenceImportPath } from './reqlan-references.js';

export class ReqlanScopeComputation extends DefaultScopeComputation {

    override async collectExportedSymbols(document: LangiumDocument): Promise<AstNodeDescription[]> {
        const exports: AstNodeDescription[] = [];
        const model = document.parseResult.value;
        if (isModel(model)) {
            for (const element of model.elements) {
                if (isIdeaDeclaration(element)) {
                    this.addExportedSymbol(element, exports, document);
                }
            }
        }
        return exports;
    }
}

interface ScopeEntry {
    version: number | undefined;
    scope: Scope;
}

export class ReqlanScopeProvider extends DefaultScopeProvider {

    protected readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];
    private readonly services: ReqlanServices;
    /**
     * Per-document cache for `scopeForFileIdeas`. Key is the document URI string.
     * Invalidated when the document version changes so edits always get a fresh scope.
     */
    private readonly fileIdeasCache = new Map<string, ScopeEntry>();
    /**
     * Per-(document, importPath) cache for `scopeForImportPath`. Key is the imported document URI string.
     * The cached scope is keyed to the imported document's version.
     */
    private readonly importPathCache = new Map<string, ScopeEntry>();

    constructor(services: ReqlanServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
        this.services = services;
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
                return this.scopeForReferenceQualifiers(document);
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
                const qualifier = container.qualifier?.ref;
                if (qualifier && isIdeaSet(qualifier)) {
                    return this.scopeForIdeasetMembers(qualifier, document);
                }
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
                return this.scopeForFileIdeas(document);
            }
        }
        if (isIdeaSet(container) && context.property === 'members') {
            const document = AstUtils.getDocument(container);
            return this.scopeForFileIdeas(document);
        }
        if (isLocalReference(container)) {
            const document = AstUtils.getDocument(container);
            if (context.property === 'idea') {
                return this.scopeForFileIdeas(document);
            }
        }
        return super.getScope(context);
    }

    private scopeForFileIdeas(document: LangiumDocument): Scope {
        const key = document.uri.toString();
        const cached = this.fileIdeasCache.get(key);
        if (cached && cached.version === document.textDocument.version) {
            return cached.scope;
        }
        const scope = this.buildFileIdeasScope(document);
        this.fileIdeasCache.set(key, { version: document.textDocument.version, scope });
        return scope;
    }

    private buildFileIdeasScope(document: LangiumDocument): Scope {
        const locals = this.localDeclarationDescriptions(document);
        return new StreamScope(
            stream(locals),
            new LazyScope(() => this.importedIdeaScope(document)),
            { concatOuterScope: false }
        );
    }

    /**
     * Every named top-level declaration in the file, regardless of source order.
     * Bare `[name]` and ideaset members resolve against this set first.
     */
    private localDeclarationDescriptions(document: LangiumDocument): AstNodeDescription[] {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return [];
        }
        return model.elements
            .filter(isIdeaDeclaration)
            .map(element => this.descriptions.createDescription(element, element.name, document));
    }

    /**
     * Imported bindings only. Built lazily so a fully-local file never walks import `.ref`s
     * while resolving same-file names.
     */
    private importedIdeaScope(document: LangiumDocument): Scope {
        return new StreamScope(stream(this.importedIdeaDescriptions(document)));
    }

    private importedIdeaDescriptions(document: LangiumDocument): AstNodeDescription[] {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return [];
        }
        const descriptions: AstNodeDescription[] = [];
        // Imported ideas enter scope under their binding name only (alias when present).
        // See import_tokenisation: aliased base names are not reserved locally.
        for (const importDecl of model.imports) {
            if (isFromImport(importDecl)) {
                for (const specifier of importDecl.specifiers) {
                    const target = specifier.idea.ref;
                    if (!target || !isIdeaDeclaration(target)) {
                        continue;
                    }
                    const name = specifierBindingName(specifier) ?? target.name;
                    descriptions.push(this.descriptions.createDescription(target, name, AstUtils.getDocument(target)));
                }
                continue;
            }
            if (isQualifiedImport(importDecl)) {
                const target = importDecl.idea.ref;
                if (!target || !isIdeaDeclaration(target)) {
                    continue;
                }
                const name = importDecl.alias ?? target.name;
                descriptions.push(this.descriptions.createDescription(target, name, AstUtils.getDocument(target)));
            }
        }
        return descriptions;
    }

    private scopeForIdeasetMembers(ideaset: IdeaSet, document: LangiumDocument): Scope {
        const descriptions = ideaset.members
            .map(member => member.ref)
            .filter((target): target is NonNullable<typeof target> =>
                target !== undefined && isIdeaDeclaration(target)
            )
            .map(target => this.descriptions.createDescription(target, target.name, AstUtils.getDocument(target)));
        if (descriptions.length > 0) {
            return new StreamScope(stream(descriptions));
        }
        return this.scopeForFileIdeas(document);
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

    private scopeForReferenceQualifiers(document: LangiumDocument): Scope {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return new StreamScope(stream([]));
        }
        const locals = model.elements
            .filter(isIdeaDeclaration)
            .map(element => this.descriptions.createDescription(element, element.name, document));
        const namedImports = model.imports.flatMap(importDecl => {
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
        return new StreamScope(stream([...locals, ...namedImports]));
    }

    private scopeForImportPaths(document: LangiumDocument): Scope {
        const model = document.parseResult.value as Model;
        if (!isModel(model)) {
            return new StreamScope(stream([]));
        }
        const descriptions = model.imports.flatMap(importDecl => {
            const path = importPathOf(importDecl);
            return path
                ? [this.descriptions.createDescription(importDecl, path, document)]
                : [];
        });
        return new StreamScope(stream(descriptions));
    }

    private scopeForImportDeclaration(importDecl: Import | FromImportSpecifier, document: LangiumDocument): Scope | undefined {
        if (isFromImportSpecifier(importDecl)) {
            const imported = this.findImportedDocument(importDecl.$container.path, document);
            if (!imported) {
                return undefined;
            }
            const target = importDecl.idea.ref;
            if (!target || !isIdeaDeclaration(target)) {
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
                    target !== undefined && isIdeaDeclaration(target)
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
            if (!target || !isIdeaDeclaration(target)) {
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
        const key = imported.uri.toString();
        const cached = this.importPathCache.get(key);
        if (cached && cached.version === imported.textDocument.version) {
            return cached.scope;
        }
        const model = imported.parseResult.value;
        if (!isModel(model)) {
            return undefined;
        }
        const descriptions = model.elements
            .filter(isIdeaDeclaration)
            .map(idea => this.descriptions.createDescription(idea, idea.name, imported));
        const scope = new StreamScope(stream(descriptions));
        this.importPathCache.set(key, { version: imported.textDocument.version, scope });
        return scope;
    }

    private findImportedDocument(path: string, document: LangiumDocument): LangiumDocument | undefined {
        return findImportedDocument(
            path,
            document,
            this.documents,
            pathResolveContextFromServices(this.services)
        );
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
    if (isFromImport(entry) || isInvalidFromImport(entry)) {
        return undefined;
    }
    return entry.alias;
}

/**
 * Defers outer-scope construction until a local lookup misses.
 * StreamScope `getElement` does not call the outer scope when a local name matches.
 */
class LazyScope implements Scope {
    private resolved: Scope | undefined;

    constructor(private readonly load: () => Scope) {}

    getElement(name: string): AstNodeDescription | undefined {
        return this.inner().getElement(name);
    }

    getElements(name: string): ReturnType<Scope['getElements']> {
        return this.inner().getElements(name);
    }

    getAllElements(): ReturnType<Scope['getAllElements']> {
        return this.inner().getAllElements();
    }

    private inner(): Scope {
        return this.resolved ??= this.load();
    }
}

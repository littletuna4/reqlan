/**
 * Code completion for references, import paths, file paths, and attributes.
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
 * rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
 * rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".reference_code_completion]
 * rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".reference_code_completion_sequencing]
 */
import type { AstNode, AstNodeDescription, FileSystemProvider, LangiumDocument, LangiumDocuments, URI } from 'langium';
import { AstUtils, UriUtils, stream } from 'langium';
import type { MaybePromise } from 'langium';
import {
    DefaultCompletionProvider,
    type CompletionAcceptor,
    type CompletionContext,
    type CompletionProviderOptions
} from 'langium/lsp';
import { reqlanStringDelimiter } from './reqlan-quoted-strings.js';
import type { CompletionList, CompletionParams } from 'vscode-languageserver';
import { CompletionItemKind, CompletionList as LspCompletionList } from 'vscode-languageserver';
import {
    isAttribute,
    isBracketReference,
    isIdea,
    isIdeaSet,
    isLocalReference,
    isModel,
    isOneLinerIdea,
    isQualifiedReference,
    isWikiLink
} from './generated/ast.js';
import { AttributeCatalogStore, ENDORSED_ATTRIBUTE_KEYS } from './reqlan-attribute-catalog.js';
import {
    findContainingIdea,
    getAttributeKeyContext,
    getAttributeValueContext,
    getCompletionSite,
    getReferencePrefixContext
} from './reqlan-completion-context.js';
import {
    pathResolveContextFromServices,
    resolveImportRootUri,
    resolveRqConfig
} from './reqlan-path-resolve.js';
import { referenceIdea } from './reqlan-references.js';
import { collectWorkspaceAttributeCatalog } from './reqlan-workspace-attribute-catalog.js';
import type { ReqlanServices } from './reqlan-module.js';

const UNREACHABLE_DISTANCE = 9999;

export class ReqlanCompletionProvider extends DefaultCompletionProvider {

    private readonly documents: LangiumDocuments;
    private readonly fileSystem: FileSystemProvider;
    private readonly descriptions: ReqlanServices['workspace']['AstNodeDescriptionProvider'];
    private readonly services: ReqlanServices;
    readonly attributeCatalog: AttributeCatalogStore;
    override readonly completionOptions: CompletionProviderOptions = {
        triggerCharacters: ['@', '[', '.', '/', '"']
    };

    constructor(services: ReqlanServices, attributeCatalog = new AttributeCatalogStore()) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
        this.fileSystem = services.shared.workspace.FileSystemProvider;
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
        this.services = services;
        this.attributeCatalog = attributeCatalog;
    }

    override async getCompletion(
        document: LangiumDocument,
        params: CompletionParams
    ): Promise<CompletionList | undefined> {
        const site = getCompletionSite(document, params.position);
        if (site === 'main_description') {
            return LspCompletionList.create([], true);
        }
        if (site === 'attribute_key') {
            return this.completeAttributeKeys(document, params);
        }
        if (site === 'attribute_value') {
            return this.completeAttributeValues(document, params);
        }
        if (site === 'reference') {
            return this.completeReferenceNames(document, params);
        }
        this.refreshWorkspaceAttributeCatalog();
        return super.getCompletion(document, params);
    }

    protected override completionFor(
        context: CompletionContext,
        next: Parameters<DefaultCompletionProvider['completionFor']>[1],
        acceptor: CompletionAcceptor
    ): MaybePromise<void> {
        if (next.property === 'path') {
            this.completeImportPath(context, acceptor);
            return;
        }
        if (next.property === 'file') {
            this.completeFilePath(context, acceptor);
            return;
        }
        return super.completionFor(context, next, acceptor);
    }

    protected override getReferenceCandidates(
        refInfo: Parameters<DefaultCompletionProvider['getReferenceCandidates']>[0],
        context: CompletionContext
    ) {
        const candidates = super.getReferenceCandidates(refInfo, context);
        if (refInfo.property !== 'idea' && refInfo.property !== 'ideaset' && refInfo.property !== 'members') {
            return candidates;
        }
        const descriptions = this.documents.all.toArray().flatMap(doc => {
            const model = doc.parseResult.value;
            if (!isModel(model)) {
                return [];
            }
            return model.elements
                .filter(element => {
                    if (refInfo.property === 'ideaset') {
                        return isIdeaSet(element);
                    }
                    return isIdea(element) || isOneLinerIdea(element);
                })
                .map(element => this.descriptions.createDescription(element, element.name, doc));
        });
        return stream([...candidates, ...descriptions]).distinct((description: AstNodeDescription) => description.name);
    }

    private completeAttributeKeys(document: LangiumDocument, params: CompletionParams): CompletionList {
        const context = getAttributeKeyContext(document, params.position);
        if (!context) {
            return LspCompletionList.create([], true);
        }
        this.refreshWorkspaceAttributeCatalog();
        const usedKeys = new Set(this.collectUsedAttributeKeys(document));
        const endorsed = new Set<string>(ENDORSED_ATTRIBUTE_KEYS);
        const items = this.attributeCatalog.get().keys.flatMap(key => {
            if (context.prefix && !key.startsWith(context.prefix)) {
                return [];
            }
            if (usedKeys.has(key)) {
                return [];
            }
            return [{
                label: key,
                kind: CompletionItemKind.Property,
                insertText: key,
                range: {
                    start: context.replaceStart,
                    end: context.replaceEnd
                },
                detail: endorsed.has(key) ? 'endorsed attribute' : 'workspace attribute'
            }];
        });
        return LspCompletionList.create(items, true);
    }

    private completeAttributeValues(document: LangiumDocument, params: CompletionParams): CompletionList {
        const context = getAttributeValueContext(document, params.position);
        if (!context) {
            return LspCompletionList.create([], true);
        }
        this.refreshWorkspaceAttributeCatalog();
        const values = this.attributeCatalog.get().valuesByKey[context.attributeName] ?? [];
        const items = values.flatMap(value => {
            if (context.prefix && !value.startsWith(context.prefix)) {
                return [];
            }
            return [{
                label: value,
                kind: CompletionItemKind.Value,
                insertText: value,
                range: {
                    start: context.replaceStart,
                    end: context.replaceEnd
                },
                detail: `@${context.attributeName}`
            }];
        });
        return LspCompletionList.create(items, true);
    }

    private completeReferenceNames(document: LangiumDocument, params: CompletionParams): CompletionList {
        const context = getReferencePrefixContext(document, params.position);
        if (!context) {
            return LspCompletionList.create([], true);
        }
        const names = new Set<string>();
        const docs = this.documents.all.toArray();
        if (!docs.some(doc => doc.uri.toString() === document.uri.toString())) {
            docs.push(document);
        }
        for (const doc of docs) {
            const model = doc.parseResult.value;
            if (!isModel(model)) {
                continue;
            }
            for (const element of model.elements) {
                if (isIdea(element) || isOneLinerIdea(element) || isIdeaSet(element)) {
                    names.add(element.name);
                }
            }
        }
        const center = findContainingIdea(document, params.position)?.name;
        const distances = center
            ? hopDistancesFromCenter(center, buildIdeaReferenceAdjacency(docs))
            : new Map<string, number>();
        const items = [...names].flatMap(name => {
            if (context.prefix && !name.startsWith(context.prefix)) {
                return [];
            }
            const distance = distances.get(name) ?? UNREACHABLE_DISTANCE;
            return [{
                label: name,
                kind: CompletionItemKind.Reference,
                insertText: name,
                sortText: `${String(distance).padStart(4, '0')}_${name}`,
                range: {
                    start: context.replaceStart,
                    end: context.replaceEnd
                }
            }];
        }).sort((left, right) => {
            const leftDistance = distances.get(String(left.label)) ?? UNREACHABLE_DISTANCE;
            const rightDistance = distances.get(String(right.label)) ?? UNREACHABLE_DISTANCE;
            return leftDistance - rightDistance || String(left.label).localeCompare(String(right.label));
        });
        return LspCompletionList.create(items, true);
    }

    private completeImportPath(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.completeQuotedPath(context, acceptor, this.collectPathCandidates(context.document, '.rq'));
    }

    private completeFilePath(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.completeQuotedPath(context, acceptor, this.collectPathCandidates(context.document));
    }

    private completeQuotedPath(
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        candidates: string[]
    ): void {
        const text = context.textDocument.getText();
        const existingText = text.substring(context.tokenOffset, context.offset);
        let paths = candidates;
        let range = {
            start: context.position,
            end: context.position
        };
        if (existingText.length > 0) {
            const delimiter = reqlanStringDelimiter(existingText);
            const unquoted = delimiter
                ? existingText.slice(1, existingText.endsWith(delimiter) ? -1 : undefined)
                : existingText;
            paths = paths.filter(path => path.startsWith(unquoted));
            const quoteOffset = delimiter ? 1 : 0;
            const start = context.textDocument.positionAt(context.tokenOffset + quoteOffset);
            const end = context.textDocument.positionAt(
                context.tokenEndOffset - (delimiter && existingText.endsWith(delimiter) ? 1 : 0)
            );
            range = { start, end };
        }
        for (const path of paths) {
            const delimiter = reqlanStringDelimiter(existingText);
            const opening = delimiter ?? '"';
            const needsClosing = !delimiter || !existingText.endsWith(delimiter);
            const closing = needsClosing ? opening : '';
            acceptor(context, {
                label: path,
                textEdit: {
                    newText: `${delimiter ? '' : opening}${path}${closing}`,
                    range
                },
                kind: CompletionItemKind.File,
                sortText: '0'
            });
        }
    }

    private collectPathCandidates(document: LangiumDocument, extensionFilter?: string): string[] {
        const paths = new Set([
            ...this.collectRelativePathCandidates(document, extensionFilter),
            ...this.collectAliasedPathCandidates(document, extensionFilter)
        ]);
        return [...paths].sort((left, right) => left.localeCompare(right));
    }

    private collectRelativePathCandidates(document: LangiumDocument, extensionFilter?: string): string[] {
        const dirname = UriUtils.dirname(document.uri).toString();
        const paths = new Set<string>();
        for (const doc of this.documents.all.toArray()) {
            if (UriUtils.equals(doc.uri, document.uri)) {
                continue;
            }
            if (extensionFilter && !doc.uri.path.endsWith(extensionFilter)) {
                continue;
            }
            paths.add(this.relativePathWithoutExtension(dirname, doc.uri));
        }
        const sourceDir = UriUtils.dirname(document.uri);
        if (this.fileSystem.existsSync(sourceDir)) {
            this.collectDirectoryPaths(sourceDir, dirname, paths, extensionFilter);
        }
        return [...paths];
    }

    private collectAliasedPathCandidates(document: LangiumDocument, extensionFilter?: string): string[] {
        const pathContext = pathResolveContextFromServices(this.services);
        const config = resolveRqConfig(document, pathContext);
        const paths = new Set<string>();
        for (const mapping of config.importRoots) {
            const importRoot = resolveImportRootUri(document, pathContext, mapping);
            if (!importRoot) {
                continue;
            }
            const aliasPrefix = `${mapping.alias}/`;
            const rootString = importRoot.toString();
            for (const doc of this.documents.all.toArray()) {
                if (UriUtils.equals(doc.uri, document.uri)) {
                    continue;
                }
                if (extensionFilter && !doc.uri.path.endsWith(extensionFilter)) {
                    continue;
                }
                const aliased = this.aliasedPathWithoutExtension(rootString, aliasPrefix, doc.uri);
                if (aliased) {
                    paths.add(aliased);
                }
            }
            if (this.fileSystem.existsSync(importRoot)) {
                this.collectAliasedDirectoryPaths(importRoot, rootString, aliasPrefix, paths, extensionFilter);
            }
        }
        return [...paths];
    }

    private collectDirectoryPaths(
        directory: URI,
        sourceDirname: string,
        paths: Set<string>,
        extensionFilter?: string
    ): void {
        for (const entry of this.fileSystem.readDirectorySync(directory)) {
            const name = entry.uri.path.split('/').pop() ?? '';
            if (!name || name.startsWith('.')) {
                continue;
            }
            if (entry.isDirectory) {
                paths.add(`${this.relativePathWithoutExtension(sourceDirname, entry.uri)}/`);
                continue;
            }
            if (extensionFilter && !name.endsWith(extensionFilter)) {
                continue;
            }
            paths.add(this.relativePathWithoutExtension(sourceDirname, entry.uri));
        }
    }

    private collectAliasedDirectoryPaths(
        directory: URI,
        rootString: string,
        aliasPrefix: string,
        paths: Set<string>,
        extensionFilter?: string
    ): void {
        for (const entry of this.fileSystem.readDirectorySync(directory)) {
            const name = entry.uri.path.split('/').pop() ?? '';
            if (!name || name.startsWith('.')) {
                continue;
            }
            if (entry.isDirectory) {
                const aliased = this.aliasedPathWithoutExtension(rootString, aliasPrefix, entry.uri);
                if (aliased) {
                    paths.add(`${aliased}/`);
                }
                continue;
            }
            if (extensionFilter && !name.endsWith(extensionFilter)) {
                continue;
            }
            const aliased = this.aliasedPathWithoutExtension(rootString, aliasPrefix, entry.uri);
            if (aliased) {
                paths.add(aliased);
            }
        }
    }

    private relativePathWithoutExtension(dirname: string, targetUri: URI): string {
        const uriString = targetUri.toString();
        const uriWithoutExt = uriString.slice(0, uriString.length - UriUtils.extname(targetUri).length);
        let relativePath = UriUtils.relative(dirname, uriWithoutExt);
        if (!relativePath.startsWith('.')) {
            relativePath = `./${relativePath}`;
        }
        return relativePath;
    }

    private aliasedPathWithoutExtension(
        rootString: string,
        aliasPrefix: string,
        targetUri: URI
    ): string | undefined {
        const uriString = targetUri.toString();
        const uriWithoutExt = uriString.slice(0, uriString.length - UriUtils.extname(targetUri).length);
        const relativePath = UriUtils.relative(rootString, uriWithoutExt);
        if (!relativePath || relativePath.startsWith('..')) {
            return undefined;
        }
        return `${aliasPrefix}${relativePath}`;
    }

    private collectUsedAttributeKeys(document: LangiumDocument): string[] {
        return AstUtils.streamAst(document.parseResult.value)
            .filter(isAttribute)
            .map(attribute => attribute.name)
            .toArray();
    }

    private refreshWorkspaceAttributeCatalog(): void {
        const workspaceCatalog = collectWorkspaceAttributeCatalog(this.documents);
        this.attributeCatalog.mergeWorkspaceKeys(workspaceCatalog.keys, workspaceCatalog.valuesByKey);
    }
}

/** Undirected idea↔idea edges from bracket/wikilink references in the given documents. */
export function buildIdeaReferenceAdjacency(documents: LangiumDocument[]): Map<string, Set<string>> {
    const adjacency = new Map<string, Set<string>>();
    const addEdge = (left: string, right: string) => {
        if (!left || !right || left === right) {
            return;
        }
        if (!adjacency.has(left)) {
            adjacency.set(left, new Set());
        }
        if (!adjacency.has(right)) {
            adjacency.set(right, new Set());
        }
        adjacency.get(left)!.add(right);
        adjacency.get(right)!.add(left);
    };

    for (const document of documents) {
        for (const node of AstUtils.streamAst(document.parseResult.value)) {
            if (!isBracketReference(node) && !isWikiLink(node)) {
                continue;
            }
            const source = enclosingIdeaName(node);
            if (!source) {
                continue;
            }
            for (const target of referencedNames(node.target)) {
                addEdge(source, target);
            }
        }
    }
    return adjacency;
}

/** BFS hop distances from `center` over an undirected adjacency map. */
export function hopDistancesFromCenter(center: string, adjacency: Map<string, Set<string>>): Map<string, number> {
    const distances = new Map<string, number>();
    const queue: string[] = [center];
    distances.set(center, 0);
    while (queue.length > 0) {
        const current = queue.shift()!;
        const nextDist = (distances.get(current) ?? 0) + 1;
        for (const neighbour of adjacency.get(current) ?? []) {
            if (!distances.has(neighbour)) {
                distances.set(neighbour, nextDist);
                queue.push(neighbour);
            }
        }
    }
    return distances;
}

function enclosingIdeaName(node: AstNode): string | undefined {
    let current: AstNode | undefined = node;
    while (current) {
        if (isIdea(current) || isOneLinerIdea(current) || isIdeaSet(current)) {
            return current.name;
        }
        current = current.$container;
    }
    return undefined;
}

function referencedNames(target: Parameters<typeof referenceIdea>[0]): string[] {
    const names: string[] = [];
    const idea = referenceIdea(target);
    if (idea) {
        names.push(idea.ref?.name ?? idea.$refText);
    }
    if (isLocalReference(target) && target.ideaset) {
        names.push(target.ideaset.ref?.name ?? target.ideaset.$refText);
    }
    if (isQualifiedReference(target) && target.ideaset) {
        names.push(target.ideaset.ref?.name ?? target.ideaset.$refText);
    }
    return names.filter(Boolean);
}

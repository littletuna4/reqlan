/**
 * Code completion for references, import paths, file paths, and attributes.
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
 * rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
 * rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".reference_code_completion]
 * rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".reference_code_completion_sequencing]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_ranking]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".anonymous_reference_code_completion]
 */
import type { AstNode, AstNodeDescription, FileSystemProvider, LangiumDocument, LangiumDocuments } from 'langium';
import { AstUtils, stream } from 'langium';
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
    isModel,
    isOneLinerIdea,
    isQualifiedReference,
    isWikiLink
} from './generated/ast.js';
import { AttributeCatalogStore, ENDORSED_ATTRIBUTE_KEYS } from './reqlan-attribute-catalog.js';
import {
    findContainingIdea,
    getAnonymousImportPathContext,
    getAttributeKeyContext,
    getAttributeValueContext,
    getCompletionSite,
    getReferencePrefixContext
} from './reqlan-completion-context.js';
import {
    collectPathCompletionCandidates,
    comparePathCompletionCandidates,
    pathCompletionFilterText,
    pathCompletionSortText,
    type PathCompletionCandidate
} from './reqlan-path-completion.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';
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
        if (site === 'anonymous_import_path') {
            return this.completeAnonymousImportPath(document, params);
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
        if (next.property === 'path' || next.property === 'file') {
            // Import paths and anonymous bracket paths share the same candidate logic.
            this.completeImportPath(context, acceptor);
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

    private completeAnonymousImportPath(document: LangiumDocument, params: CompletionParams): CompletionList {
        const context = getAnonymousImportPathContext(document, params.position);
        if (!context) {
            return LspCompletionList.create([], true);
        }
        const candidates = this.collectImportPathCandidates(document, context.prefix)
            .sort((left, right) => comparePathCompletionCandidates(document, left, right));
        const items = candidates.map(candidate => ({
            label: candidate.path,
            kind: candidate.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
            textEdit: {
                newText: candidate.path,
                range: {
                    start: context.replaceStart,
                    end: context.replaceEnd
                }
            },
            sortText: pathCompletionSortText(document, candidate),
            filterText: pathCompletionFilterText(context.prefix, candidate)
        }));
        return LspCompletionList.create(items, true);
    }

    private completeImportPath(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const text = context.textDocument.getText();
        const existingText = text.substring(context.tokenOffset, context.offset);
        let range = {
            start: context.position,
            end: context.position
        };
        let prefix = '';
        if (existingText.length > 0) {
            const delimiter = reqlanStringDelimiter(existingText);
            prefix = delimiter
                ? existingText.slice(1, existingText.endsWith(delimiter) ? -1 : undefined)
                : existingText;
            const quoteOffset = delimiter ? 1 : 0;
            const start = context.textDocument.positionAt(context.tokenOffset + quoteOffset);
            const end = context.textDocument.positionAt(
                context.tokenEndOffset - (delimiter && existingText.endsWith(delimiter) ? 1 : 0)
            );
            range = { start, end };
        }
        const candidates = this.collectImportPathCandidates(context.document, prefix)
            .sort((left, right) => comparePathCompletionCandidates(context.document, left, right));
        for (const candidate of candidates) {
            const delimiter = reqlanStringDelimiter(existingText);
            const opening = delimiter ?? '"';
            const needsClosing = !delimiter || !existingText.endsWith(delimiter);
            const closing = needsClosing ? opening : '';
            acceptor(context, {
                label: candidate.path,
                textEdit: {
                    newText: `${delimiter ? '' : opening}${candidate.path}${closing}`,
                    range
                },
                kind: candidate.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
                sortText: pathCompletionSortText(context.document, candidate),
                filterText: pathCompletionFilterText(prefix, candidate)
            });
        }
    }

    /** Shared candidate set for `import "…"` / `from "…"` and anonymous `["…"]` paths. */
    private collectImportPathCandidates(document: LangiumDocument, prefix: string): PathCompletionCandidate[] {
        return collectPathCompletionCandidates(
            document,
            this.documents,
            this.fileSystem,
            pathResolveContextFromServices(this.services),
            { extensionFilter: '.rq', prefix }
        );
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
    if (isQualifiedReference(target) && target.ideaset) {
        names.push(target.ideaset.ref?.name ?? target.ideaset.$refText);
    }
    return names.filter(Boolean);
}

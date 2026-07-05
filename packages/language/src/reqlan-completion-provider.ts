/**
 * Code completion for references, import paths, file paths, and attributes.
 */
import type { AstNodeDescription, FileSystemProvider, LangiumDocument, LangiumDocuments, URI } from 'langium';
import { AstUtils, UriUtils, stream } from 'langium';
import type { MaybePromise } from 'langium';
import {
    DefaultCompletionProvider,
    type CompletionAcceptor,
    type CompletionContext,
    type CompletionProviderOptions
} from 'langium/lsp';
import type { CompletionList, CompletionParams } from 'vscode-languageserver';
import { CompletionItemKind, CompletionList as LspCompletionList } from 'vscode-languageserver';
import {
    isAttribute,
    isIdea,
    isIdeaSet,
    isModel,
    isOneLinerIdea
} from './generated/ast.js';
import { AttributeCatalogStore, ENDORSED_ATTRIBUTE_KEYS } from './reqlan-attribute-catalog.js';
import {
    getAttributeKeyContext,
    getAttributeValueContext,
    getCompletionSite,
    getReferencePrefixContext
} from './reqlan-completion-context.js';
import { collectWorkspaceAttributeCatalog } from './reqlan-workspace-attribute-catalog.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanCompletionProvider extends DefaultCompletionProvider {

    private readonly documents: LangiumDocuments;
    private readonly fileSystem: FileSystemProvider;
    private readonly descriptions: ReqlanServices['workspace']['AstNodeDescriptionProvider'];
    readonly attributeCatalog: AttributeCatalogStore;
    override readonly completionOptions: CompletionProviderOptions = {
        triggerCharacters: ['@', '[', '.', '/', '"']
    };

    constructor(services: ReqlanServices, attributeCatalog = new AttributeCatalogStore()) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
        this.fileSystem = services.shared.workspace.FileSystemProvider;
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
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
        const items = [...names].flatMap(name => {
            if (context.prefix && !name.startsWith(context.prefix)) {
                return [];
            }
            return [{
                label: name,
                kind: CompletionItemKind.Reference,
                insertText: name,
                range: {
                    start: context.replaceStart,
                    end: context.replaceEnd
                }
            }];
        }).sort((left, right) => String(left.label).localeCompare(String(right.label)));
        return LspCompletionList.create(items, true);
    }

    private completeImportPath(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.completeQuotedPath(context, acceptor, this.collectRelativePathCandidates(context.document, '.rq'));
    }

    private completeFilePath(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.completeQuotedPath(context, acceptor, this.collectRelativePathCandidates(context.document));
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
            const unquoted = existingText.startsWith('"')
                ? existingText.slice(1)
                : existingText;
            paths = paths.filter(path => path.startsWith(unquoted));
            const quoteOffset = existingText.startsWith('"') ? 1 : 0;
            const start = context.textDocument.positionAt(context.tokenOffset + quoteOffset);
            const end = context.textDocument.positionAt(
                context.tokenEndOffset - (existingText.endsWith('"') ? 1 : 0)
            );
            range = { start, end };
        }
        for (const path of paths) {
            const delimiter = existingText.startsWith('"') ? '' : '"';
            const closing = existingText.startsWith('"') && !existingText.endsWith('"') ? '"' : delimiter;
            acceptor(context, {
                label: path,
                textEdit: {
                    newText: `${delimiter}${path}${closing}`,
                    range
                },
                kind: CompletionItemKind.File,
                sortText: '0'
            });
        }
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
        return [...paths].sort((left, right) => left.localeCompare(right));
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

    private relativePathWithoutExtension(dirname: string, targetUri: URI): string {
        const uriString = targetUri.toString();
        const uriWithoutExt = uriString.slice(0, uriString.length - UriUtils.extname(targetUri).length);
        let relativePath = UriUtils.relative(dirname, uriWithoutExt);
        if (!relativePath.startsWith('.')) {
            relativePath = `./${relativePath}`;
        }
        return relativePath;
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

/**
 * Quick fixes for unresolved references: add import, rewrite qualified ref, search, create.
 * Also offers a search code action when the cursor is inside a [reference] / [[wikilink]].
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 * rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import type { LangiumDocument, URI } from 'langium';
import { AstUtils, DocumentValidator, URI as UriCtor, UriUtils } from 'langium';
import type { CodeActionParams, Command, Diagnostic } from 'vscode-languageserver';
import { CodeActionKind } from 'vscode-languageserver';
import type { CodeActionProvider } from 'langium/lsp';
import {
    isIdea,
    isIdeaSet,
    isModel,
    isOneLinerIdea,
    type Model
} from './generated/ast.js';
import {
    buildFromImportEdit,
    relativeRqImportPath
} from './reqlan-import-edits.js';
import { isRefactorIdeaDeclaration } from './reqlan-idea-refactor.js';
import type { ReqlanServices } from './reqlan-module.js';
import {
    sharedNameCatalog,
    type NameCatalogEntry,
    type NameCatalogKind
} from './reqlan-name-catalog.js';
import { findReferenceSearchSite, buildContextForRange } from './reqlan-reference-search-site.js';

export const REQLAN_IMPORT_ERROR_SEARCH_COMMAND = 'reqlan.importError.search';
export const REQLAN_IMPORT_ERROR_CREATE_COMMAND = 'reqlan.importError.createFile';
export const REQLAN_SEARCH_REFERENCE_COMMAND = 'reqlan.searchReference';
export const REQLAN_REFACTOR_DELETE_IDEA_COMMAND = 'reqlan.refactor.deleteIdea';
export const REQLAN_REFACTOR_MOVE_IDEA_COMMAND = 'reqlan.refactor.moveIdea';

/** Args for idea move/delete refactor commands. */
export interface IdeaRefactorCommandArgs {
    documentUri: string;
    ideaName: string;
    range: Diagnostic['range'];
}

const MAX_IMPORT_SUGGESTIONS = 5;

interface LinkingDiagnosticData {
    code?: string;
    containerType?: string;
    property?: string;
    refText?: string;
}

export interface ImportErrorCommandArgs {
    documentUri: string;
    refText: string;
    range: Diagnostic['range'];
}

/** Args for reference search webview (replace existing ref or wrap prose). */
export interface SearchReferenceCommandArgs {
    documentUri: string;
    refText: string;
    range: Diagnostic['range'];
    mode: 'replace' | 'wrap';
    context?: {
        ideaName: string;
        before: string;
        target: string;
        after: string;
    };
}

interface SymbolMatch {
    name: string;
    kind: NameCatalogKind;
    fileUri: string;
    importPath: string;
}

type CodeActionLike = import('vscode-languageserver').CodeAction;

export class ReqlanCodeActionProvider implements CodeActionProvider {
    private readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];
    private readonly indexManager: ReqlanServices['shared']['workspace']['IndexManager'];

    constructor(services: ReqlanServices) {
        this.documents = services.shared.workspace.LangiumDocuments;
        this.indexManager = services.shared.workspace.IndexManager;
    }

    getCodeActions(document: LangiumDocument, params: CodeActionParams): Array<Command | CodeActionLike> {
        const actions: Array<Command | CodeActionLike> = [];
        for (const diagnostic of params.context.diagnostics) {
            actions.push(...this.actionsForDiagnostic(document, diagnostic));
        }
        const searchFromCursor = this.createSearchReferenceAction(document, params);
        if (searchFromCursor) {
            actions.push(searchFromCursor);
        }
        actions.push(...this.createIdeaRefactorActions(document, params));
        return actions;
    }

    /**
     * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
     * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_delete]
     */
    private createIdeaRefactorActions(
        document: LangiumDocument,
        params: CodeActionParams
    ): CodeActionLike[] {
        const idea = findIdeaDeclarationAtRange(document, params.range);
        if (!idea?.name || !idea.$cstNode) {
            return [];
        }
        const args: IdeaRefactorCommandArgs = {
            documentUri: document.textDocument.uri,
            ideaName: idea.name,
            range: idea.$cstNode.range
        };
        return [
            {
                title: `Delete idea '${idea.name}' and update references`,
                kind: CodeActionKind.Refactor,
                command: {
                    title: `Delete idea '${idea.name}'`,
                    command: REQLAN_REFACTOR_DELETE_IDEA_COMMAND,
                    arguments: [args]
                }
            },
            {
                title: `Move idea '${idea.name}' to another file…`,
                kind: CodeActionKind.Refactor,
                command: {
                    title: `Move idea '${idea.name}'`,
                    command: REQLAN_REFACTOR_MOVE_IDEA_COMMAND,
                    arguments: [args]
                }
            }
        ];
    }

    /**
     * When the cursor/selection is inside a [reference], or on prose that can
     * become one, offer a search action that opens the idea-search webview.
     */
    private createSearchReferenceAction(
        document: LangiumDocument,
        params: CodeActionParams
    ): CodeActionLike | undefined {
        const site = findReferenceSearchSite(document, params.range);
        if (!site) {
            return undefined;
        }
        // Avoid duplicating the linking-error search action on the same range.
        const alreadyHasSearch = site.mode === 'replace' && params.context.diagnostics.some(diagnostic => {
            const data = diagnostic.data as LinkingDiagnosticData | undefined;
            return data?.code === DocumentValidator.LinkingError
                && data.refText === site.refText
                && rangesOverlap(diagnostic.range, site.range);
        });
        if (alreadyHasSearch) {
            return undefined;
        }
        const args: SearchReferenceCommandArgs = {
            documentUri: document.textDocument.uri,
            refText: site.refText,
            range: site.range,
            mode: site.mode,
            context: site.context
        };
        const title = site.mode === 'wrap'
            ? (site.refText
                ? `Wrap '${site.refText}' as idea reference…`
                : 'Wrap selection as idea reference…')
            : (site.refText
                ? `Search for idea to replace '${site.refText}'…`
                : 'Search for idea reference…');
        return {
            title,
            kind: CodeActionKind.Refactor,
            command: {
                title: 'Search for idea reference',
                command: REQLAN_SEARCH_REFERENCE_COMMAND,
                arguments: [args]
            }
        };
    }

    private actionsForDiagnostic(
        document: LangiumDocument,
        diagnostic: Diagnostic
    ): Array<Command | CodeActionLike> {
        const data = diagnostic.data as LinkingDiagnosticData | undefined;
        if (data?.code !== DocumentValidator.LinkingError || !data.refText) {
            return [];
        }
        if (!isResolvableIdeaProperty(data.property)) {
            return [];
        }

        const refText = data.refText;
        const actions: Array<Command | CodeActionLike> = [];
        const matches = this.findMatches(document, refText);
        let preferredSet = false;

        for (const match of matches.slice(0, MAX_IMPORT_SUGGESTIONS)) {
            if (match.kind === 'ideaset' || match.kind === 'file') {
                continue;
            }
            const addImport = this.createAddImportAction(document, diagnostic, match, !preferredSet);
            if (addImport) {
                actions.push(addImport);
                preferredSet = true;
            }
            const rewrite = this.createQualifiedRewriteAction(document, diagnostic, match);
            if (rewrite) {
                actions.push(rewrite);
            }
        }

        actions.push(this.createSearchCommand(document, diagnostic, refText));
        actions.push(this.createCreateFileCommand(document, diagnostic, refText));
        return actions;
    }

    private findMatches(document: LangiumDocument, refText: string): SymbolMatch[] {
        const byKey = new Map<string, SymbolMatch>();
        const add = (match: SymbolMatch) => {
            if (UriUtils.equals(UriCtor.parse(match.fileUri), document.uri)) {
                return;
            }
            const key = `${match.kind}:${match.fileUri}:${match.name}`;
            if (!byKey.has(key)) {
                byKey.set(key, match);
            }
        };

        for (const entry of sharedNameCatalog.findExact(refText)) {
            add(this.toMatch(document.uri, entry));
        }

        for (const doc of this.documents.all) {
            if (UriUtils.equals(doc.uri, document.uri)) {
                continue;
            }
            const model = doc.parseResult.value;
            if (!isModel(model)) {
                continue;
            }
            for (const element of model.elements) {
                if ((isIdea(element) || isOneLinerIdea(element) || isIdeaSet(element)) && element.name === refText) {
                    add({
                        name: element.name,
                        kind: isIdeaSet(element) ? 'ideaset' : isOneLinerIdea(element) ? 'oneliner' : 'idea',
                        fileUri: doc.uri.toString(),
                        importPath: relativeRqImportPath(document.uri, doc.uri)
                    });
                }
            }
        }

        for (const description of this.indexManager.allElements()) {
            if (description.name !== refText || UriUtils.equals(description.documentUri, document.uri)) {
                continue;
            }
            const kind = nodeTypeToKind(description.type);
            if (!kind) {
                continue;
            }
            add({
                name: description.name,
                kind,
                fileUri: description.documentUri.toString(),
                importPath: relativeRqImportPath(document.uri, description.documentUri)
            });
        }

        return [...byKey.values()].sort((left, right) =>
            left.importPath.length - right.importPath.length || left.name.localeCompare(right.name)
        );
    }

    private toMatch(fromUri: URI, entry: NameCatalogEntry): SymbolMatch {
        return {
            name: entry.name,
            kind: entry.kind,
            fileUri: entry.fileUri,
            importPath: relativeRqImportPath(fromUri, UriCtor.parse(entry.fileUri))
        };
    }

    private createAddImportAction(
        document: LangiumDocument,
        diagnostic: Diagnostic,
        match: SymbolMatch,
        isPreferred: boolean
    ): CodeActionLike | undefined {
        const edit = buildFromImportEdit(document, match.importPath, match.name);
        if (!edit) {
            return undefined;
        }
        return {
            title: `Add import from "${match.importPath}"`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred,
            edit: {
                changes: {
                    [document.textDocument.uri]: [edit]
                }
            }
        };
    }

    private createQualifiedRewriteAction(
        document: LangiumDocument,
        diagnostic: Diagnostic,
        match: SymbolMatch
    ): CodeActionLike | undefined {
        return {
            title: `Change to ["${match.importPath}".${match.name}]`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.textDocument.uri]: [{
                        range: diagnostic.range,
                        newText: `"${match.importPath}".${match.name}`
                    }]
                }
            }
        };
    }

    private createSearchCommand(
        document: LangiumDocument,
        diagnostic: Diagnostic,
        refText: string
    ): CodeActionLike {
        const args: SearchReferenceCommandArgs = {
            documentUri: document.textDocument.uri,
            refText,
            range: diagnostic.range,
            mode: 'replace',
            context: buildContextForRange(document, diagnostic.range)
        };
        return {
            title: `Search for idea to replace '${refText}'…`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            command: {
                title: `Search for idea to replace '${refText}'`,
                command: REQLAN_SEARCH_REFERENCE_COMMAND,
                arguments: [args]
            }
        };
    }

    private createCreateFileCommand(
        document: LangiumDocument,
        diagnostic: Diagnostic,
        refText: string
    ): CodeActionLike {
        const args: ImportErrorCommandArgs = {
            documentUri: document.textDocument.uri,
            refText,
            range: diagnostic.range
        };
        return {
            title: `Create '${refText}' in a new file and import it…`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            command: {
                title: `Create '${refText}' in a new file`,
                command: REQLAN_IMPORT_ERROR_CREATE_COMMAND,
                arguments: [args]
            }
        };
    }
}

function isResolvableIdeaProperty(property: string | undefined): boolean {
    return property === 'idea' || property === 'ideaset' || property === 'members';
}

function rangesOverlap(
    left: { start: { line: number; character: number }; end: { line: number; character: number } },
    right: { start: { line: number; character: number }; end: { line: number; character: number } }
): boolean {
    if (left.end.line < right.start.line || right.end.line < left.start.line) {
        return false;
    }
    if (left.end.line === right.start.line && left.end.character < right.start.character) {
        return false;
    }
    if (right.end.line === left.start.line && right.end.character < left.start.character) {
        return false;
    }
    return true;
}

function nodeTypeToKind(type: string): NameCatalogKind | undefined {
    switch (type) {
        case 'Idea':
            return 'idea';
        case 'OneLinerIdea':
            return 'oneliner';
        case 'IdeaSet':
            return 'ideaset';
        default:
            return undefined;
    }
}

/** Test helper: collect quick fixes for linking diagnostics on a document. */
export function collectImportErrorCodeActions(
    provider: ReqlanCodeActionProvider,
    document: LangiumDocument
): Array<Command | CodeActionLike> {
    const diagnostics = (document.diagnostics ?? []).filter(diagnostic => {
        const data = diagnostic.data as LinkingDiagnosticData | undefined;
        return data?.code === DocumentValidator.LinkingError;
    });
    return provider.getCodeActions(document, {
        textDocument: { uri: document.textDocument.uri },
        range: diagnostics[0]?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        context: { diagnostics }
    });
}

export function isModelDocument(document: LangiumDocument): document is LangiumDocument<Model> {
    return isModel(document.parseResult.value);
}

function findIdeaDeclarationAtRange(document: LangiumDocument, range: Diagnostic['range']) {
    const offset = document.textDocument.offsetAt(range.start);
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
        if (!isRefactorIdeaDeclaration(node) || !node.$cstNode) {
            continue;
        }
        const start = document.textDocument.offsetAt(node.$cstNode.range.start);
        const end = document.textDocument.offsetAt(node.$cstNode.range.end);
        if (offset >= start && offset <= end) {
            return node;
        }
        // Also match when the selection is exactly on the name token line.
        if (
            range.start.line === node.$cstNode.range.start.line
            && range.start.character <= (node.name?.length ?? 0) + 1
        ) {
            return node;
        }
    }
    return undefined;
}

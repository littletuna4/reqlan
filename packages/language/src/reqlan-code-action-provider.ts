/**
 * Quick fixes for unresolved references: add import, rewrite qualified ref, search, create.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 */
import type { LangiumDocument, URI } from 'langium';
import { DocumentValidator, URI as UriCtor, UriUtils } from 'langium';
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
import type { ReqlanServices } from './reqlan-module.js';
import {
    sharedNameCatalog,
    type NameCatalogEntry,
    type NameCatalogKind
} from './reqlan-name-catalog.js';

export const REQLAN_IMPORT_ERROR_SEARCH_COMMAND = 'reqlan.importError.search';
export const REQLAN_IMPORT_ERROR_CREATE_COMMAND = 'reqlan.importError.createFile';

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
        return actions;
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
        const args: ImportErrorCommandArgs = {
            documentUri: document.textDocument.uri,
            refText,
            range: diagnostic.range
        };
        return {
            title: `Search index for '${refText}'…`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            command: {
                title: `Search index for '${refText}'`,
                command: REQLAN_IMPORT_ERROR_SEARCH_COMMAND,
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

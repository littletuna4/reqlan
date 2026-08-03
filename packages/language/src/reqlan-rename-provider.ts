/**
 * LSP rename for reqlan symbols, including `rq:[...]` comment idea tokens in .rq docs.
 * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_rename]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".refactor_support]
 */
import type { AstNode, LangiumDocument } from 'langium';
import { AstUtils, CstUtils } from 'langium';
import { DefaultRenameProvider } from 'langium/lsp';
import type { Position, RenameParams, WorkspaceEdit } from 'vscode-languageserver';
import { TextEdit } from 'vscode-languageserver';
import { isIdea, isIdeaSet, isOneLinerIdea } from './generated/ast.js';
import { findCommentIdeaRenameMatches } from './reqlan-comment-rename.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanRenameProvider extends DefaultRenameProvider {
    private readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];

    constructor(services: ReqlanServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
    }

    override async rename(
        document: LangiumDocument,
        params: RenameParams
    ): Promise<WorkspaceEdit | undefined> {
        const base = await super.rename(document, params);
        const target = this.resolveRenameTarget(document, params.position);
        const oldName = targetName(target, node => this.nameProvider.getName(node));
        if (!oldName || oldName === params.newName) {
            return base;
        }

        const declarationDoc = target ? AstUtils.getDocument(target) : document;
        const declarationPath = declarationDoc.uri.path;
        const changes = { ...(base?.changes ?? {}) };

        for (const doc of this.documents.all) {
            const uri = doc.uri.toString();
            const text = doc.textDocument.getText();
            const matches = findCommentIdeaRenameMatches(text, oldName, { includePathless: true });
            const edits = matches
                .filter(match => commentMatchApplies(
                    match.path,
                    declarationPath,
                    doc.uri.toString() === declarationDoc.uri.toString()
                ))
                .map(match => ({
                    range: match.range,
                    newText: params.newName
                }))
                .filter(edit => !(changes[uri] ?? []).some(existing => rangesEqual(existing.range, edit.range)));

            if (edits.length === 0) {
                continue;
            }
            changes[uri] = [
                ...(changes[uri] ?? []),
                ...edits.map(edit => TextEdit.replace(edit.range, edit.newText))
            ];
        }

        return Object.keys(changes).length > 0 ? { changes } : base;
    }

    private resolveRenameTarget(document: LangiumDocument, position: Position): AstNode | undefined {
        const rootNode = document.parseResult.value.$cstNode;
        if (!rootNode) {
            return undefined;
        }
        const offset = document.textDocument.offsetAt(position);
        const leafNode = CstUtils.findDeclarationNodeAtOffset(
            rootNode,
            offset,
            this.grammarConfig.nameRegexp
        );
        if (!leafNode) {
            return undefined;
        }
        const declarations = this.references.findDeclarations(leafNode);
        return declarations[0] ?? leafNode.astNode;
    }
}

function targetName(
    target: AstNode | undefined,
    getName: (node: AstNode) => string | undefined
): string | undefined {
    if (!target) {
        return undefined;
    }
    if (isIdea(target) || isOneLinerIdea(target) || isIdeaSet(target)) {
        return target.name;
    }
    return getName(target);
}

function commentMatchApplies(
    path: string | undefined,
    declarationPath: string,
    isDeclarationDocument: boolean
): boolean {
    if (path === undefined) {
        return isDeclarationDocument;
    }
    const normalizedDecl = declarationPath.replace(/\\/g, '/');
    const normalizedPath = path.replace(/\\/g, '/');
    const declBase = normalizedDecl.slice(normalizedDecl.lastIndexOf('/') + 1);
    const pathBase = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1);
    return normalizedDecl.endsWith(normalizedPath)
        || normalizedDecl.endsWith(`${normalizedPath.replace(/\.rq$/i, '')}.rq`)
        || declBase === pathBase
        || declBase.replace(/\.rq$/i, '') === pathBase.replace(/\.rq$/i, '');
}

function rangesEqual(
    left: { start: { line: number; character: number }; end: { line: number; character: number } },
    right: { start: { line: number; character: number }; end: { line: number; character: number } }
): boolean {
    return left.start.line === right.start.line
        && left.start.character === right.start.character
        && left.end.line === right.end.line
        && left.end.character === right.end.character;
}

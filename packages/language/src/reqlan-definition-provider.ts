/**
 * Go-to-definition for import paths opens the imported file instead of cycling local references.
 * Interacts with cross-file imports and qualified wikilink path segments.
 */
import type { CstNode, LangiumDocument, MaybePromise } from 'langium';
import { AstUtils, CstUtils, GrammarUtils } from 'langium';
import { DefaultDefinitionProvider, type GoToLink } from 'langium/lsp';
import type { DefinitionParams, Position } from 'vscode-languageserver';
import { LocationLink } from 'vscode-languageserver';
import {
    isImport,
    isReferenceTarget,
    type Import
} from './generated/ast.js';
import { findImportedDocument } from './reqlan-imports.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanDefinitionProvider extends DefaultDefinitionProvider {

    private readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];

    constructor(services: ReqlanServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
    }

    override getDefinition(document: LangiumDocument, params: DefinitionParams): MaybePromise<LocationLink[] | undefined> {
        const importPathLink = this.findImportPathLinkAtPosition(document, params.position);
        if (importPathLink) {
            return [this.toLocationLink(importPathLink)];
        }
        return super.getDefinition(document, params);
    }

    protected override findLinks(source: CstNode): GoToLink[] {
        const importPathLink = this.linkForImportPath(source);
        if (importPathLink) {
            return [importPathLink];
        }
        return super.findLinks(source).map(link => this.redirectImportPathLink(link) ?? link);
    }

    private linkForImportPath(source: CstNode): GoToLink | undefined {
        const assignment = GrammarUtils.findAssignment(source);
        if (!assignment) {
            return undefined;
        }
        const container = source.astNode;
        if (isImport(container) && assignment.feature === 'path') {
            return this.createImportedFileLink(source, container);
        }
        if (isReferenceTarget(container) && assignment.feature === 'path') {
            const importDecl = container.path?.ref;
            if (importDecl) {
                return this.createImportedFileLink(source, importDecl);
            }
        }
        return undefined;
    }

    private redirectImportPathLink(link: GoToLink): GoToLink | undefined {
        const importDecl = link.target.astNode;
        if (!isImportPathTarget(importDecl, link.target)) {
            return undefined;
        }
        return this.createImportedFileLink(link.source, importDecl);
    }

    private createImportedFileLink(source: CstNode, importDecl: Import): GoToLink | undefined {
        const document = AstUtils.getDocument(importDecl);
        const imported = findImportedDocument(importDecl.path, document, this.documents);
        const target = imported?.parseResult.value.$cstNode;
        if (!imported || !target) {
            return undefined;
        }
        return {
            source: CstUtils.getDatatypeNode(source) ?? source,
            target,
            targetDocument: imported
        };
    }

    private findImportPathLinkAtPosition(document: LangiumDocument, position: Position): GoToLink | undefined {
        const root = document.parseResult.value.$cstNode;
        if (!root) {
            return undefined;
        }
        const offset = document.textDocument.offsetAt(position);
        let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
        while (current) {
            const link = this.linkForImportPath(current);
            if (link) {
                return link;
            }
            current = current.container;
        }
        return undefined;
    }

    private toLocationLink(link: GoToLink): LocationLink {
        return LocationLink.create(
            link.targetDocument.textDocument.uri,
            (link.target.astNode.$cstNode ?? link.target).range,
            link.target.range,
            link.source.range
        );
    }
}

function isImportPathTarget(node: unknown, targetCst: CstNode): node is Import {
    if (!isImport(node)) {
        return false;
    }
    if (!node.alias) {
        return true;
    }
    const pathNode = GrammarUtils.findNodeForProperty(node.$cstNode, 'path');
    return pathNode === targetCst || (pathNode !== undefined && targetCst.offset >= pathNode.offset && targetCst.end <= pathNode.end);
}

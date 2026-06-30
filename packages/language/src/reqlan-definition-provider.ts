/**
 * Go-to-definition for imports, file references, symbols, and embedded comment references.
 */
import type { CstNode, FileSystemProvider, LangiumDocument, MaybePromise } from 'langium';
import { AstUtils, CstUtils, GrammarUtils, URI } from 'langium';
import { DefaultDefinitionProvider, type GoToLink } from 'langium/lsp';
import type { DefinitionParams, Position } from 'vscode-languageserver';
import { LocationLink } from 'vscode-languageserver';
import {
    findCommentReferencePartAt,
    resolveCommentReferenceIdea,
    resolveFileUri
} from './reqlan-comment-resolver.js';
import { findEmbeddedFileReferenceAt } from './reqlan-embedded-file-references.js';
import {
    resolveEmbeddedFileReferenceLink,
    resolveFileReferenceLink,
    resolveImportPathLink,
    resolvedFileLinkToGoToTarget,
    resolvedFileLinkToGoToTargetFromFilesystem,
    type ResolvedFileLink
} from './reqlan-file-link-resolver.js';
import {
    isFileReference,
    isFileSymbolReference,
    isImport,
    isQualifiedReference,
    type FileReference,
    type FileSymbolReference,
    type Import
} from './generated/ast.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanDefinitionProvider extends DefaultDefinitionProvider {

    private readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];
    private readonly fileSystem: FileSystemProvider;

    constructor(services: ReqlanServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
        this.fileSystem = services.shared.workspace.FileSystemProvider;
    }

    override getDefinition(document: LangiumDocument, params: DefinitionParams): MaybePromise<LocationLink[] | undefined> {
        const commentLinks = this.createCommentReferenceLinks(document, params.position);
        if (commentLinks) {
            return commentLinks;
        }
        const embeddedReference = findEmbeddedFileReferenceAt(document, params.position);
        if (embeddedReference) {
            const resolved = resolveEmbeddedFileReferenceLink(embeddedReference, document, this.documents, this.fileSystem);
            if (resolved) {
                return [this.resolvedFileLinkToLocationLink(resolved)];
            }
        }
        const fileLink = this.findFileReferenceLinkAtPosition(document, params.position);
        if (fileLink) {
            return [this.toLocationLink(fileLink)];
        }
        const importPathLink = this.findImportPathLinkAtPosition(document, params.position);
        if (importPathLink) {
            return [this.toLocationLink(importPathLink)];
        }
        return super.getDefinition(document, params);
    }

    protected override findLinks(source: CstNode): GoToLink[] {
        const fileLink = this.linkForFileReference(source);
        if (fileLink) {
            return [fileLink];
        }
        const importPathLink = this.linkForImportPath(source);
        if (importPathLink) {
            return [importPathLink];
        }
        return super.findLinks(source).map(link => this.redirectImportPathLink(link) ?? link);
    }

    private linkForFileReference(source: CstNode): GoToLink | undefined {
        const assignment = GrammarUtils.findAssignment(source);
        if (!assignment) {
            return undefined;
        }
        const container = source.astNode;
        if ((isFileReference(container) || isFileSymbolReference(container)) && assignment.feature === 'file') {
            return this.createFileLink(source, container);
        }
        return undefined;
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
        if (isQualifiedReference(container) && assignment.feature === 'path') {
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
        const resolved = resolveImportPathLink(importDecl, this.documents);
        if (!resolved) {
            return undefined;
        }
        const targetDocument = this.documents.getDocument(URI.parse(resolved.targetUri.split('#')[0]));
        if (!targetDocument) {
            return undefined;
        }
        return resolvedFileLinkToGoToTarget(resolved, source, targetDocument);
    }

    private createFileLink(source: CstNode, reference: FileReference | FileSymbolReference): GoToLink | undefined {
        const resolved = resolveFileReferenceLink(reference, this.documents, this.fileSystem);
        if (!resolved) {
            return undefined;
        }
        const targetDocument = this.documents.getDocument(URI.parse(resolved.targetUri));
        if (targetDocument) {
            return resolvedFileLinkToGoToTarget(resolved, source, targetDocument);
        }
        return resolvedFileLinkToGoToTargetFromFilesystem(resolved, source);
    }

    private createCommentReferenceLinks(document: LangiumDocument, position: Position): LocationLink[] | undefined {
        const part = findCommentReferencePartAt(document, position);
        if (!part) {
            return undefined;
        }
        if (part.property === 'path') {
            const targetDocument = this.documents.getDocument(resolveFileUri(part.reference.path, document));
            const target = targetDocument?.parseResult.value.$cstNode;
            if (!targetDocument || !target) {
                return undefined;
            }
            return [LocationLink.create(
                targetDocument.textDocument.uri,
                target.range,
                target.range,
                part.reference.range
            )];
        }
        const idea = resolveCommentReferenceIdea(part.reference, document, this.documents);
        const ideaNode = idea?.$cstNode;
        const targetDocument = idea ? this.documents.getDocument(AstUtils.getDocument(idea).uri) : undefined;
        if (!ideaNode || !targetDocument) {
            return undefined;
        }
        return [LocationLink.create(
            targetDocument.textDocument.uri,
            ideaNode.range,
            ideaNode.range,
            part.reference.range
        )];
    }

    private findImportPathLinkAtPosition(document: LangiumDocument, position: Position): GoToLink | undefined {
        const root = document.parseResult.value.$cstNode;
        if (!root) {
            return undefined;
        }
        const offset = document.textDocument.offsetAt(position);
        let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
        while (current) {
            const link = this.linkForImportPath(current) ?? this.linkForFileReference(current);
            if (link) {
                return link;
            }
            current = current.container;
        }
        return undefined;
    }

    private findFileReferenceLinkAtPosition(document: LangiumDocument, position: Position): GoToLink | undefined {
        const root = document.parseResult.value.$cstNode;
        if (!root) {
            return undefined;
        }
        const offset = document.textDocument.offsetAt(position);
        let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
        while (current) {
            const link = this.linkForFileReference(current);
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
            (link.target.astNode?.$cstNode ?? link.target).range,
            link.target.range,
            link.source.range
        );
    }

    private resolvedFileLinkToLocationLink(link: ResolvedFileLink): LocationLink {
        const targetRange = link.targetRange ?? {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
        };
        return LocationLink.create(
            link.targetUri,
            targetRange,
            targetRange,
            link.sourceRange
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

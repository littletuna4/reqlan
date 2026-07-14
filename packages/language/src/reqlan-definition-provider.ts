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
    resolveCommentDefinitionLinks,
    type EmbeddedCommentReference
} from './reqlan-comment-resolver.js';
import {
    resolveFileReferenceLink,
    resolveImportPathLink,
    resolveQualifiedReferencePathLink,
    resolvedFileLinkToGoToTarget,
    resolvedFileLinkToGoToTargetFromFilesystem,
    type ResolvedFileLink
} from './reqlan-file-link-resolver.js';
import {
    isNamespaceImportOnlyReference,
    resolveNamespaceImportReferenceLink
} from './reqlan-namespace-import-links.js';
import { findFileReferenceAtPosition } from './reqlan-reference-at-position.js';
import { isMarkdownLinkLabelPosition } from './reqlan-markdown-links.js';
import {
    isFileReference,
    isFileSymbolReference,
    isFromImport,
    isImport,
    isLocalReference,
    isQualifiedReference,
    type FileReference,
    type FileSymbolReference,
    type Import,
    type LocalReference,
    type QualifiedReference
} from './generated/ast.js';
import type { ReqlanServices } from './reqlan-module.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';

export class ReqlanDefinitionProvider extends DefaultDefinitionProvider {

    private readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];
    private readonly fileSystem: FileSystemProvider;
    private readonly services: ReqlanServices;

    constructor(services: ReqlanServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
        this.fileSystem = services.shared.workspace.FileSystemProvider;
        this.services = services;
    }

    private pathContext() {
        return pathResolveContextFromServices(this.services);
    }

    override getDefinition(document: LangiumDocument, params: DefinitionParams): MaybePromise<LocationLink[] | undefined> {
        if (isMarkdownLinkLabelPosition(document, params.position)) {
            return undefined;
        }
        const commentPart = findCommentReferencePartAt(document, params.position);
        if (commentPart?.property === 'idea') {
            return this.createCommentIdeaReferenceLinks(document, commentPart.reference);
        }
        const fileReference = findFileReferenceAtPosition(
            document,
            params.position,
            this.documents,
            this.fileSystem,
            this.pathContext()
        );
        if (fileReference) {
            if (fileReference.resolution === 'folder' || fileReference.resolution === 'missing') {
                return undefined;
            }
            return [this.resolvedFileLinkToLocationLink(fileReference)];
        }
        const fileLink = this.findFileReferenceLinkAtPosition(document, params.position);
        if (fileLink) {
            return [this.toLocationLink(fileLink)];
        }
        const anonymousImportPathLink = this.findAnonymousImportPathLinkAtPosition(document, params.position);
        if (anonymousImportPathLink) {
            return [this.toLocationLink(anonymousImportPathLink)];
        }
        const importPathLink = this.findImportPathLinkAtPosition(document, params.position);
        if (importPathLink) {
            return [this.toLocationLink(importPathLink)];
        }
        return super.getDefinition(document, params);
    }

    protected override findLinks(source: CstNode): GoToLink[] {
        const fileLink = this.linkForFileReference(source) ?? this.linkForNamespaceImportReference(source);
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

    private createNamespaceImportLink(source: CstNode, reference: LocalReference | QualifiedReference): GoToLink | undefined {
        const resolved = resolveNamespaceImportReferenceLink(
            reference,
            this.documents,
            this.fileSystem,
            this.pathContext()
        );
        if (!resolved) {
            return undefined;
        }
        const targetDocument = this.documents.getDocument(URI.parse(resolved.targetUri));
        if (targetDocument) {
            return resolvedFileLinkToGoToTarget(resolved, source, targetDocument);
        }
        return resolvedFileLinkToGoToTargetFromFilesystem(resolved, source);
    }

    private linkForNamespaceImportReference(source: CstNode): GoToLink | undefined {
        const assignment = GrammarUtils.findAssignment(source);
        if (!assignment) {
            return undefined;
        }
        const container = source.astNode;
        if (!(isLocalReference(container) || isQualifiedReference(container))) {
            return undefined;
        }
        if (!isNamespaceImportOnlyReference(container)) {
            return undefined;
        }
        const property = assignment.feature;
        if (property !== 'idea' && property !== 'ideaset' && property !== 'qualifier') {
            return undefined;
        }
        return this.createNamespaceImportLink(source, container);
    }

    private linkForImportPath(source: CstNode): GoToLink | undefined {
        let current: CstNode | undefined = source;
        while (current) {
            const container = current.astNode;
            const assignment = GrammarUtils.findAssignment(current);
            if (isImport(container) && assignment?.feature === 'path') {
                return this.createImportedFileLink(current, container);
            }
            if (isQualifiedReference(container) && this.isOnQualifiedReferencePath(current, container)) {
                const importDecl = container.path?.ref;
                if (importDecl) {
                    return this.createImportedFileLink(current, importDecl);
                }
                const resolved = resolveQualifiedReferencePathLink(container, this.documents, this.pathContext());
                if (resolved) {
                    const targetDocument = this.documents.getDocument(URI.parse(resolved.targetUri.split('#')[0]));
                    if (targetDocument) {
                        return resolvedFileLinkToGoToTarget(resolved, current, targetDocument);
                    }
                }
            }
            current = current.container;
        }
        return undefined;
    }

    private isOnQualifiedReferencePath(source: CstNode, reference: QualifiedReference): boolean {
        const pathNode = reference.path?.$refNode ?? GrammarUtils.findNodeForProperty(reference.$cstNode, 'path');
        if (!pathNode) {
            return false;
        }
        return source.offset >= pathNode.offset && source.end <= pathNode.end;
    }

    private redirectImportPathLink(link: GoToLink): GoToLink | undefined {
        const importDecl = link.target.astNode;
        if (!isImportPathTarget(importDecl, link.target)) {
            return undefined;
        }
        return this.createImportedFileLink(link.source, importDecl);
    }

    private createImportedFileLink(source: CstNode, importDecl: Import): GoToLink | undefined {
        const resolved = resolveImportPathLink(importDecl, this.documents, this.pathContext());
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
        const resolved = resolveFileReferenceLink(reference, this.documents, this.fileSystem, this.pathContext());
        if (!resolved) {
            return undefined;
        }
        const targetDocument = this.documents.getDocument(URI.parse(resolved.targetUri));
        if (targetDocument) {
            return resolvedFileLinkToGoToTarget(resolved, source, targetDocument);
        }
        return resolvedFileLinkToGoToTargetFromFilesystem(resolved, source);
    }

    private createCommentIdeaReferenceLinks(
        document: LangiumDocument,
        reference: EmbeddedCommentReference
    ): LocationLink[] | undefined {
        return resolveCommentDefinitionLinks(reference, document, this.documents, this.pathContext());
    }

    private findAnonymousImportPathLinkAtPosition(document: LangiumDocument, position: Position): GoToLink | undefined {
        const offset = document.textDocument.offsetAt(position);
        for (const node of AstUtils.streamAst(document.parseResult.value)) {
            if (!isQualifiedReference(node) || node.path?.ref) {
                continue;
            }
            const pathNode = node.path?.$refNode ?? GrammarUtils.findNodeForProperty(node.$cstNode, 'path');
            if (!pathNode || offset < pathNode.offset || offset >= pathNode.end) {
                continue;
            }
            const resolved = resolveQualifiedReferencePathLink(node, this.documents, this.pathContext());
            if (!resolved) {
                continue;
            }
            const targetDocument = this.documents.getDocument(URI.parse(resolved.targetUri.split('#')[0]));
            if (!targetDocument) {
                continue;
            }
            return resolvedFileLinkToGoToTarget(resolved, pathNode, targetDocument);
        }
        return undefined;
    }

    private findImportPathLinkAtPosition(document: LangiumDocument, position: Position): GoToLink | undefined {
        const root = document.parseResult.value.$cstNode;
        if (!root) {
            return undefined;
        }
        const offset = document.textDocument.offsetAt(position);
        let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
        while (current) {
            const link = this.linkForImportPath(current) ?? this.linkForFileReference(current) ?? this.linkForNamespaceImportReference(current);
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
            const link = this.linkForFileReference(current) ?? this.linkForNamespaceImportReference(current);
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
    if (isFromImport(node) || !node.alias) {
        return true;
    }
    const pathNode = GrammarUtils.findNodeForProperty(node.$cstNode, 'path');
    return pathNode === targetCst || (pathNode !== undefined && targetCst.offset >= pathNode.offset && targetCst.end <= pathNode.end);
}

/**
 * Resolves file references and import paths to target URIs and editor ranges.
 */
import type { CstNode, FileSystemProvider, LangiumDocument, LangiumDocuments, URI } from 'langium';
import { AstUtils, CstUtils, GrammarUtils } from 'langium';
import type { Range } from 'vscode-languageserver';
import { resolveFileUri } from './reqlan-comment-resolver.js';
import type { EmbeddedFileReference } from './reqlan-embedded-file-references.js';
import { findEmbeddedFileReferencesInText } from './reqlan-embedded-file-references.js';
import { findImportedDocument } from './reqlan-imports.js';
import { qualifiedReferenceImportPath } from './reqlan-references.js';
import {
    findTestLineInText,
    parseFileReferenceString,
    type ParsedFileReference
} from './reqlan-file-references.js';
import {
    isFileReference,
    isFileSymbolReference,
    isImport,
    isLocalReference,
    isMarkdownLink,
    isQualifiedReference,
    type FileReference,
    type FileSymbolReference,
    type Import,
    type MarkdownLink,
    type QualifiedReference
} from './generated/ast.js';
import { parseMarkdownLink } from './reqlan-references.js';
import {
    isNamespaceImportOnlyReference,
    resolveNamespaceImportReferenceLink
} from './reqlan-namespace-import-links.js';

export type ReferenceResolution = 'file' | 'folder' | 'missing';

export interface ResolvedFileLink {
    sourceRange: Range;
    targetUri: string;
    targetRange?: Range;
    resolution?: ReferenceResolution;
    folderFiles?: string[];
}

export function classifyReferenceUri(
    targetUri: URI,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider
): ReferenceResolution {
    if (documents.getDocument(targetUri)) {
        return 'file';
    }
    if (!fileSystem.existsSync(targetUri)) {
        return 'missing';
    }
    return fileSystem.statSync(targetUri).isDirectory ? 'folder' : 'file';
}

export function listFolderFileNames(fileSystem: FileSystemProvider, folderUri: URI): string[] {
    return fileSystem.readDirectorySync(folderUri)
        .filter(entry => entry.isFile)
        .map(entry => {
            const segments = entry.uri.path.split('/');
            return segments[segments.length - 1] ?? '';
        })
        .filter(name => name.length > 0)
        .sort((left, right) => left.localeCompare(right));
}

export function resolveFileReferenceLink(
    reference: FileReference | FileSymbolReference,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider
): ResolvedFileLink | undefined {
    const document = AstUtils.getDocument(reference);
    const parsed = parseFileReferenceString(reference.file);
    const pathNode = GrammarUtils.findNodeForProperty(reference.$cstNode, 'file');
    if (!pathNode) {
        return undefined;
    }
    return resolveParsedFileLink(document, documents, fileSystem, parsed, pathNode);
}

export function resolveImportPathLink(
    importDecl: Import,
    documents: LangiumDocuments
): ResolvedFileLink | undefined {
    const document = AstUtils.getDocument(importDecl);
    const pathNode = GrammarUtils.findNodeForProperty(importDecl.$cstNode, 'path');
    if (!pathNode) {
        return undefined;
    }
    const imported = findImportedDocument(importDecl.path, document, documents);
    const target = imported?.parseResult.value.$cstNode;
    if (!imported || !target) {
        return undefined;
    }
    return {
        sourceRange: pathNode.range,
        targetUri: imported.textDocument.uri,
        targetRange: target.range
    };
}

export function resolveQualifiedReferencePathLink(
    reference: QualifiedReference,
    documents: LangiumDocuments
): ResolvedFileLink | undefined {
    const pathNode = reference.path?.$refNode;
    if (!pathNode) {
        return undefined;
    }
    const document = AstUtils.getDocument(reference);
    const path = qualifiedReferenceImportPath(reference);
    if (!path) {
        return undefined;
    }
    const imported = findImportedDocument(path, document, documents);
    const target = imported?.parseResult.value.$cstNode;
    if (!imported || !target) {
        return undefined;
    }
    return {
        sourceRange: pathNode.range,
        targetUri: imported.textDocument.uri,
        targetRange: target.range
    };
}

export function resolveMarkdownLinkTargetLink(
    link: MarkdownLink,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider
): ResolvedFileLink | undefined {
    const parsedLink = parseMarkdownLink(link.raw);
    if (!parsedLink) {
        return undefined;
    }
    const pathNode = GrammarUtils.findNodeForProperty(link.$cstNode, 'raw');
    if (!pathNode) {
        return undefined;
    }
    const targetStart = link.raw.indexOf('](') + 2;
    const targetLength = parsedLink.target.length;
    const sourceRange = {
        start: {
            line: pathNode.range.start.line,
            character: pathNode.range.start.character + targetStart
        },
        end: {
            line: pathNode.range.start.line,
            character: pathNode.range.start.character + targetStart + targetLength
        }
    };
    const parsed = parseFileReferenceString(parsedLink.target);
    const targetUri = resolveFileUri(parsed.filePath, document);
    return resolvePathStringLink(document, documents, fileSystem, parsed, targetUri, sourceRange);
}

export function resolveEmbeddedFileReferenceLink(
    reference: EmbeddedFileReference,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider
): ResolvedFileLink | undefined {
    const parsed = parseFileReferenceString(reference.file);
    const targetUri = resolveFileUri(parsed.filePath, document);
    return resolvePathStringLink(
        document,
        documents,
        fileSystem,
        parsed,
        targetUri,
        reference.range
    );
}

export function resolveParsedFileLink(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    parsed: ParsedFileReference,
    pathNode: CstNode
): ResolvedFileLink | undefined {
    const targetUri = resolveFileUri(parsed.filePath, document);
    const sourceRange = parsed.testName
        ? stringContentRange(pathNode)
        : filePathRangeInStringNode(pathNode, parsed);
    return resolvePathStringLink(document, documents, fileSystem, parsed, targetUri, sourceRange);
}

function resolvePathStringLink(
    _document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    parsed: ParsedFileReference,
    targetUri: URI,
    sourceRange: Range
): ResolvedFileLink | undefined {
    const resolution = classifyReferenceUri(targetUri, documents, fileSystem);
    if (resolution === 'missing') {
        return undefined;
    }
    if (resolution === 'folder') {
        return {
            sourceRange,
            targetUri: targetUri.toString(),
            resolution,
            folderFiles: listFolderFileNames(fileSystem, targetUri)
        };
    }
    const text = readTargetText(targetUri, documents, fileSystem);
    if (!text) {
        return undefined;
    }
    const targetDocument = documents.getDocument(targetUri);
    let targetRange: Range | undefined;
    if (parsed.testName) {
        const line = findTestLineInText(text, parsed.testName);
        if (line !== undefined) {
            targetRange = lineRangeFromText(text, line);
        }
    } else if (parsed.lineStart !== undefined) {
        targetRange = lineRangeFromText(text, parsed.lineStart - 1);
    } else {
        targetRange = targetDocument?.parseResult.value.$cstNode?.range;
    }
    return {
        sourceRange,
        targetUri: targetUri.toString(),
        targetRange,
        resolution: 'file'
    };
}

function readTargetText(targetUri: URI, documents: LangiumDocuments, fileSystem: FileSystemProvider): string | undefined {
    const targetDocument = documents.getDocument(targetUri);
    if (targetDocument) {
        return targetDocument.textDocument.getText();
    }
    if (!fileSystem.existsSync(targetUri)) {
        return undefined;
    }
    if (fileSystem.statSync(targetUri).isDirectory) {
        return undefined;
    }
    return fileSystem.readFileSync(targetUri);
}

export function filePathRangeInStringNode(pathNode: CstNode, parsed: ParsedFileReference): Range {
    const text = pathNode.text;
    const contentStart = pathNode.range.start.character + (text.startsWith('"') ? 1 : 0);
    return {
        start: { line: pathNode.range.start.line, character: contentStart },
        end: { line: pathNode.range.start.line, character: contentStart + parsed.filePath.length }
    };
}

function stringContentRange(pathNode: CstNode): Range {
    const text = pathNode.text;
    const quoteOffset = text.startsWith('"') ? 1 : 0;
    const trailingQuote = text.endsWith('"') ? 1 : 0;
    return {
        start: { line: pathNode.range.start.line, character: pathNode.range.start.character + quoteOffset },
        end: { line: pathNode.range.end.line, character: pathNode.range.end.character - trailingQuote }
    };
}

function lineRangeFromText(text: string, line: number): Range {
    const lineText = text.split(/\r?\n/)[line] ?? '';
    return {
        start: { line, character: 0 },
        end: { line, character: lineText.length }
    };
}

export function collectFileLinks(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider
): ResolvedFileLink[] {
    const links: ResolvedFileLink[] = [];
    const linkedRanges: string[] = [];
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
        if (isFileReference(node) || isFileSymbolReference(node)) {
            const link = resolveFileReferenceLink(node, documents, fileSystem);
            if (link) {
                links.push(link);
                linkedRanges.push(rangeKey(link.sourceRange));
            }
        }
        if ((isLocalReference(node) || isQualifiedReference(node)) && isNamespaceImportOnlyReference(node)) {
            const link = resolveNamespaceImportReferenceLink(node, documents, fileSystem);
            if (link) {
                links.push(link);
                linkedRanges.push(rangeKey(link.sourceRange));
            }
        }
        if (isImport(node)) {
            const link = resolveImportPathLink(node, documents);
            if (link) {
                links.push(link);
                linkedRanges.push(rangeKey(link.sourceRange));
            }
        }
        if (isQualifiedReference(node) && node.path && !node.path.ref) {
            const link = resolveQualifiedReferencePathLink(node, documents);
            if (link) {
                links.push(link);
                linkedRanges.push(rangeKey(link.sourceRange));
            }
        }
        if (isMarkdownLink(node)) {
            const link = resolveMarkdownLinkTargetLink(node, document, documents, fileSystem);
            if (link) {
                links.push(link);
                linkedRanges.push(rangeKey(link.sourceRange));
            }
        }
    }
    for (const reference of findEmbeddedFileReferencesInText(document.textDocument.getText())) {
        const key = rangeKey(reference.range);
        if (linkedRanges.includes(key) || links.some(link => rangesOverlap(link.sourceRange, reference.range))) {
            continue;
        }
        const link = resolveEmbeddedFileReferenceLink(reference, document, documents, fileSystem);
        if (link) {
            links.push(link);
            linkedRanges.push(key);
        }
    }
    return links;
}

function rangeKey(range: Range): string {
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

function rangesOverlap(left: Range, right: Range): boolean {
    if (left.start.line !== right.start.line || right.start.line !== right.end.line || left.start.line !== left.end.line) {
        return left.start.line === right.start.line;
    }
    return left.start.character <= right.end.character && right.start.character <= left.end.character;
}

export function resolvedFileLinkTargetUri(link: ResolvedFileLink): string | undefined {
    if (link.resolution === 'folder' || link.resolution === 'missing') {
        return undefined;
    }
    if (link.targetRange) {
        return `${link.targetUri}#L${link.targetRange.start.line + 1}`;
    }
    return link.targetUri;
}

export function resolvedFileLinkToGoToTarget(
    link: ResolvedFileLink,
    sourceNode: CstNode,
    targetDocument: LangiumDocument
): { source: CstNode; target: CstNode; targetDocument: LangiumDocument } | undefined {
    const root = targetDocument.parseResult.value.$cstNode;
    if (!root) {
        return undefined;
    }
    const target = link.targetRange
        ? ({
            range: link.targetRange,
            astNode: root.astNode
        } as CstNode)
        : root;
    return {
        source: CstUtils.getDatatypeNode(sourceNode) ?? sourceNode,
        target,
        targetDocument
    };
}

export function resolvedFileLinkToGoToTargetFromFilesystem(
    link: ResolvedFileLink,
    sourceNode: CstNode
): { source: CstNode; target: CstNode; targetDocument: LangiumDocument } | undefined {
    if (!link.targetRange) {
        return undefined;
    }
    const target = { range: link.targetRange } as CstNode;
    const targetDocument = {
        textDocument: { uri: link.targetUri }
    } as LangiumDocument;
    return {
        source: CstUtils.getDatatypeNode(sourceNode) ?? sourceNode,
        target,
        targetDocument
    };
}

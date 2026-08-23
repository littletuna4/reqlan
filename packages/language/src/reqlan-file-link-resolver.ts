/**
 * Resolves file references, idea references, and import paths to target URIs and editor ranges.
 * Document links use these so same-file and cross-file refs share the same underline/click affordance.
 * Missing file refs stay in this result so the validator can underline them without creating a link.
 * rq:["../../../reqlan rq/extension/language-support/language-server-errors.rq".file_reference_errors]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".file_references]
 */
import type { AstNode, CstNode, FileSystemProvider, LangiumDocument, LangiumDocuments, Reference, URI } from 'langium';
import { AstUtils, CstUtils, GrammarUtils } from 'langium';
import type { Range } from 'vscode-languageserver';
import { resolveFileUri } from './reqlan-comment-resolver.js';
import type { EmbeddedFileReference } from './reqlan-embedded-file-references.js';
import { findEmbeddedFileReferencesInText } from './reqlan-embedded-file-references.js';
import { importPathOf } from './reqlan-import-bindings.js';
import { findImportedDocument, resolveExistingImportUri } from './reqlan-imports.js';
import type { PathResolveContext } from './reqlan-path-resolve.js';
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
    isWildcardReference,
    type FileReference,
    type FileSymbolReference,
    type Import,
    type LocalReference,
    type MarkdownLink,
    type QualifiedReference,
    type WildcardReference
} from './generated/ast.js';
import { parseMarkdownLink } from './reqlan-references.js';
import { reqlanStringDelimiter } from './reqlan-quoted-strings.js';
import {
    isNamespaceImportOnlyReference,
    resolveNamespaceImportReferenceLink
} from './reqlan-namespace-import-links.js';
import {
    resolveWildcardReferenceMatches,
    wildcardArgsFromReference,
    type WildcardMatch,
    type WildcardReferenceArgs
} from './reqlan-wildcard-resolve.js';

export type ReferenceResolution = 'file' | 'folder' | 'missing' | 'wildcard';

export type FileLinkTargetIssue = 'empty' | 'parse-error';

export const FILE_REFERENCE_MISSING = 'file-reference-missing';

export interface ResolvedFileLink {
    sourceRange: Range;
    targetUri: string;
    targetRange?: Range;
    resolution?: ReferenceResolution;
    folderFiles?: string[];
    targetIssue?: FileLinkTargetIssue;
    /** Authored path (no test/line suffix) for missing-file diagnostics. */
    authoredPath?: string;
    /** Present when resolution is `wildcard`. */
    wildcardArgs?: WildcardReferenceArgs;
    wildcardMatches?: WildcardMatch[];
}

function withFileSystem(
    fileSystem: FileSystemProvider,
    context?: PathResolveContext
): PathResolveContext {
    return { ...context, fileSystem: context?.fileSystem ?? fileSystem };
}

export function classifyReferenceUri(
    targetUri: URI,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider
): ReferenceResolution {
    if (findTargetDocument(targetUri, documents)) {
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
    fileSystem: FileSystemProvider,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const document = AstUtils.getDocument(reference);
    const parsed = parseFileReferenceString(reference.file);
    const pathNode = GrammarUtils.findNodeForProperty(reference.$cstNode, 'file');
    if (!pathNode) {
        return undefined;
    }
    return resolveParsedFileLink(document, documents, fileSystem, parsed, pathNode, context);
}

export function resolveImportPathLink(
    importDecl: Import,
    documents: LangiumDocuments,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const path = importPathOf(importDecl);
    if (!path) {
        return undefined;
    }
    const document = AstUtils.getDocument(importDecl);
    const pathNode = GrammarUtils.findNodeForProperty(importDecl.$cstNode, 'path');
    const sourceRange = cstRange(pathNode);
    if (!sourceRange) {
        return undefined;
    }
    const imported = findImportedDocument(path, document, documents, context);
    const target = imported?.parseResult.value.$cstNode;
    if (!imported || !target) {
        return undefined;
    }
    return {
        sourceRange,
        targetUri: imported.textDocument.uri,
        targetRange: target.range
    };
}

export function resolveQualifiedReferencePathLink(
    reference: QualifiedReference,
    documents: LangiumDocuments,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const pathNode = reference.path?.$refNode
        ?? GrammarUtils.findNodeForProperty(reference.$cstNode, 'path');
    const sourceRange = cstRange(pathNode);
    if (!sourceRange) {
        return undefined;
    }
    const document = AstUtils.getDocument(reference);
    const path = qualifiedReferenceImportPath(reference);
    if (!path) {
        return undefined;
    }
    const imported = findImportedDocument(path, document, documents, context);
    const target = imported?.parseResult.value.$cstNode;
    if (!imported || !target) {
        return undefined;
    }
    return {
        sourceRange,
        targetUri: imported.textDocument.uri,
        targetRange: target.range
    };
}

export function resolveMarkdownLinkTargetLink(
    link: MarkdownLink,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    context?: PathResolveContext
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
    const targetUri = resolveFileUri(parsed.filePath, document, withFileSystem(fileSystem, context));
    return resolvePathStringLink(document, documents, fileSystem, parsed, targetUri, sourceRange);
}

export function resolveEmbeddedFileReferenceLink(
    reference: EmbeddedFileReference,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const parsed = parseFileReferenceString(reference.file);
    const targetUri = resolveFileUri(parsed.filePath, document, withFileSystem(fileSystem, context));
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
    pathNode: CstNode,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const targetUri = resolveFileUri(parsed.filePath, document, withFileSystem(fileSystem, context));
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
    if (!parsed.filePath.trim()) {
        return missingFileLink(sourceRange, targetUri, parsed.filePath);
    }
    if (isRemoteFileReferencePath(parsed.filePath)) {
        return undefined;
    }
    const resolution = classifyReferenceUri(targetUri, documents, fileSystem);
    if (resolution === 'missing') {
        return missingFileLink(sourceRange, targetUri, parsed.filePath);
    }
    if (resolution === 'folder') {
        return {
            sourceRange,
            targetUri: targetUri.toString(),
            resolution,
            folderFiles: listFolderFileNames(fileSystem, targetUri),
            authoredPath: parsed.filePath
        };
    }
    const text = readTargetText(targetUri, documents, fileSystem);
    if (text === undefined) {
        return missingFileLink(sourceRange, targetUri, parsed.filePath);
    }
    const targetIssue = detectFileLinkTargetIssue(text, findTargetDocument(targetUri, documents));
    let targetRange: Range | undefined;
    if (parsed.testName) {
        const line = findTestLineInText(text, parsed.testName);
        if (line !== undefined) {
            targetRange = lineRangeFromText(text, line);
        }
    } else if (parsed.lineStart !== undefined) {
        targetRange = lineRangeFromText(text, parsed.lineStart - 1);
    } else {
        targetRange = fileStartRange();
    }
    return {
        sourceRange,
        targetUri: targetUri.toString(),
        targetRange,
        resolution: 'file',
        targetIssue,
        authoredPath: parsed.filePath
    };
}

function missingFileLink(sourceRange: Range, targetUri: URI, authoredPath: string): ResolvedFileLink {
    return {
        sourceRange,
        targetUri: targetUri.toString(),
        resolution: 'missing',
        authoredPath
    };
}

function isRemoteFileReferencePath(path: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path);
}

export function detectFileLinkTargetIssue(
    text: string,
    targetDocument: LangiumDocument | undefined
): FileLinkTargetIssue | undefined {
    if (text.length === 0) {
        return 'empty';
    }
    if (targetDocument && targetDocument.parseResult.parserErrors.length > 0) {
        return 'parse-error';
    }
    return undefined;
}

export function fileLinkTargetIssueMessage(issue: FileLinkTargetIssue): string {
    switch (issue) {
        case 'empty':
            return 'Referenced file is empty.';
        case 'parse-error':
            return 'Referenced file has parse errors.';
    }
}

export function fileLinkMissingMessage(path: string): string {
    const trimmed = path.trim();
    if (!trimmed) {
        return 'Could not resolve file reference.';
    }
    return `Could not resolve file reference '${trimmed}'.`;
}

function findTargetDocument(targetUri: URI, documents: LangiumDocuments): LangiumDocument | undefined {
    const direct = documents.getDocument(targetUri);
    if (direct) {
        return direct;
    }
    const normalizedTarget = normalizeUriPath(targetUri);
    for (const document of documents.all) {
        if (normalizeUriPath(document.uri) === normalizedTarget) {
            return document;
        }
    }
    return undefined;
}

function normalizeUriPath(uri: URI): string {
    return decodeURIComponent(uri.path).replace(/\\/g, '/');
}

function readTargetText(targetUri: URI, documents: LangiumDocuments, fileSystem: FileSystemProvider): string | undefined {
    const targetDocument = findTargetDocument(targetUri, documents);
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

export function bindingNameSourceRange(bindingNode: CstNode, bindingName: string): Range {
    const line = bindingNode.range.start.line;
    const startCharacter = bindingNode.range.start.character;
    return {
        start: { line, character: startCharacter },
        end: { line, character: startCharacter + bindingName.length }
    };
}

export function resolveImportedFileLink(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    filePath: string,
    sourceRange: Range,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const targetUri = resolveExistingImportUri(filePath, document, documents, fileSystem, context);
    const link = resolvePathStringLink(document, documents, fileSystem, { filePath }, targetUri, sourceRange);
    if (!link || link.resolution === 'missing') {
        return undefined;
    }
    return link;
}

export function filePathRangeInStringNode(pathNode: CstNode, parsed: ParsedFileReference): Range {
    const text = pathNode.text;
    const contentStart = pathNode.range.start.character + (reqlanStringDelimiter(text) ? 1 : 0);
    return {
        start: { line: pathNode.range.start.line, character: contentStart },
        end: { line: pathNode.range.start.line, character: contentStart + parsed.filePath.length }
    };
}

function stringContentRange(pathNode: CstNode): Range {
    const text = pathNode.text;
    const quoteOffset = reqlanStringDelimiter(text) ? 1 : 0;
    const trailingQuote = quoteOffset;
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

function fileStartRange(): Range {
    return {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 }
    };
}

/**
 * Document link for a resolved Langium cross-reference (same-file or imported idea/ideaset).
 * Source range is the reference name; target is the declaration name (or whole node).
 */
export function resolveLinkedAstReferenceLink(reference: Reference<AstNode> | undefined): ResolvedFileLink | undefined {
    const target = reference?.ref;
    const sourceNode = reference?.$refNode;
    const sourceRange = cstRange(sourceNode);
    if (!target || !sourceRange) {
        return undefined;
    }
    const targetDocument = AstUtils.getDocument(target);
    const nameNode = GrammarUtils.findNodeForProperty(target.$cstNode, 'name') ?? target.$cstNode;
    if (!nameNode) {
        return undefined;
    }
    return {
        sourceRange,
        targetUri: targetDocument.textDocument.uri,
        targetRange: nameNode.range,
        resolution: 'file'
    };
}

/** Idea/ideaset name links inside bracket and qualified references (not namespace-file aliases). */
export function resolveIdeaReferenceLinks(
    reference: LocalReference | QualifiedReference
): ResolvedFileLink[] {
    if (isLocalReference(reference)) {
        if (isNamespaceImportOnlyReference(reference)) {
            return [];
        }
        const link = resolveLinkedAstReferenceLink(reference.idea);
        return link ? [link] : [];
    }
    const links: ResolvedFileLink[] = [];
    const ideasetLink = resolveLinkedAstReferenceLink(reference.ideaset);
    if (ideasetLink) {
        links.push(ideasetLink);
    }
    const ideaLink = resolveLinkedAstReferenceLink(reference.idea);
    if (ideaLink) {
        links.push(ideaLink);
    }
    return links;
}

export function resolveWildcardReferenceLink(
    reference: WildcardReference,
    documents: LangiumDocuments,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const pathNode = GrammarUtils.findNodeForProperty(reference.$cstNode, 'pathPattern');
    const ideaNode = GrammarUtils.findNodeForProperty(reference.$cstNode, 'ideaPattern');
    const sourceRange = cstRange(reference.$cstNode)
        ?? (pathNode && ideaNode && isValidRange(pathNode.range) && isValidRange(ideaNode.range)
            ? {
                start: pathNode.range.start,
                end: ideaNode.range.end
            }
            : cstRange(pathNode));
    if (!sourceRange) {
        return undefined;
    }
    const matches = resolveWildcardReferenceMatches(reference, documents, context);
    const args = wildcardArgsFromReference(reference);
    return {
        sourceRange,
        targetUri: AstUtils.getDocument(reference).uri.toString(),
        resolution: 'wildcard',
        wildcardArgs: args,
        wildcardMatches: matches
    };
}

export function collectFileLinks(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    context?: PathResolveContext
): ResolvedFileLink[] {
    const pathContext = withFileSystem(fileSystem, context);
    const links: ResolvedFileLink[] = [];
    const linkedRanges: string[] = [];
    const pushLink = (link: ResolvedFileLink): void => {
        if (!isValidRange(link.sourceRange)) {
            return;
        }
        links.push(link);
        linkedRanges.push(rangeKey(link.sourceRange));
    };
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
        if (isFileReference(node) || isFileSymbolReference(node)) {
            const link = resolveFileReferenceLink(node, documents, fileSystem, pathContext);
            if (link) {
                pushLink(link);
            }
        }
        if (isWildcardReference(node)) {
            const link = resolveWildcardReferenceLink(node, documents, pathContext);
            if (link) {
                pushLink(link);
            }
        }
        if ((isLocalReference(node) || isQualifiedReference(node)) && isNamespaceImportOnlyReference(node)) {
            const link = resolveNamespaceImportReferenceLink(node, documents, fileSystem, pathContext);
            if (link) {
                pushLink(link);
            }
        } else if (isLocalReference(node) || isQualifiedReference(node)) {
            for (const link of resolveIdeaReferenceLinks(node)) {
                pushLink(link);
            }
        }
        if (isImport(node)) {
            const link = resolveImportPathLink(node, documents, pathContext);
            if (link) {
                pushLink(link);
            }
        }
        if (isQualifiedReference(node) && node.path && !node.path.ref) {
            const link = resolveQualifiedReferencePathLink(node, documents, pathContext);
            if (link) {
                pushLink(link);
            }
        }
        if (isMarkdownLink(node)) {
            const link = resolveMarkdownLinkTargetLink(node, document, documents, fileSystem, pathContext);
            if (link) {
                pushLink(link);
            }
        }
    }
    for (const reference of findEmbeddedFileReferencesInText(document.textDocument.getText())) {
        if (!isValidRange(reference.range)) {
            continue;
        }
        const key = rangeKey(reference.range);
        if (linkedRanges.includes(key) || links.some(link => rangesOverlap(link.sourceRange, reference.range))) {
            continue;
        }
        const link = resolveEmbeddedFileReferenceLink(reference, document, documents, fileSystem, pathContext);
        if (link) {
            pushLink(link);
        }
    }
    return links;
}

function isValidRange(range: Range | undefined): range is Range {
    return range?.start !== undefined && range.end !== undefined;
}

/** CST nodes from worker hydration / partial parses can lack a usable `range`. */
function cstRange(node: CstNode | undefined): Range | undefined {
    return isValidRange(node?.range) ? node.range : undefined;
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
    if (link.resolution === 'folder' || link.resolution === 'missing' || link.resolution === 'wildcard') {
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

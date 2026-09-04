/**
 * Diagnostics and document-link targets for `rq:[…]` comment references.
 * One presentation supplies both, so the clickable link and the error underline stay in sync.
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 * rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".comment_backlink_sequence]
 */
import type { FileSystemProvider, LangiumDocument, LangiumDocuments } from 'langium';
import { AstUtils, URI } from 'langium';
import type { Range } from 'vscode-languageserver';
import {
    findCommentReferencesInText,
    resolveCommentReferenceIdea,
    resolveFileUri,
    type EmbeddedCommentReference
} from './reqlan-comment-resolver.js';
import { findRqIgnoreErrorTargetLines } from './reqlan-ignore-error.js';
import {
    isResolvableImportPath,
    resolveImportCandidateUris
} from './reqlan-imports.js';
import {
    ideaRangeFromNeighbor,
    neighborHasIdea,
    neighborIdea,
    parseNeighborDocument
} from './reqlan-neighbor-parse.js';
import type { PathResolveContext } from './reqlan-path-resolve.js';

export const COMMENT_REFERENCE_MISSING_FILE = 'comment-reference-missing-file';
export const COMMENT_REFERENCE_MISSING_IDEA = 'comment-reference-missing-idea';

export interface CommentReferenceFileHost {
    exists(absolutePath: string): boolean;
    declaresIdea?(absolutePath: string, idea: string): boolean;
    workspaceDeclaresIdea?(idea: string): boolean;
    resolveWorkspaceIdea?(idea: string): string | undefined;
}

export interface CommentReferenceLink {
    range: Range;
    targetPath: string;
    targetUri?: string;
    idea: string;
}

export interface CommentReferenceDiagnostic {
    range: Range;
    message: string;
    code: typeof COMMENT_REFERENCE_MISSING_FILE | typeof COMMENT_REFERENCE_MISSING_IDEA;
}

export interface CommentReferencePresentation {
    links: CommentReferenceLink[];
    diagnostics: CommentReferenceDiagnostic[];
}

export function commentReferenceMissingFileMessage(path: string): string {
    return `Could not resolve comment reference file '${path}'.`;
}

export function commentReferenceMissingIdeaMessage(idea: string): string {
    return `Could not resolve comment reference to idea '${idea}'.`;
}

export function isCommentReferenceDiagnosticCode(code: unknown): boolean {
    return code === COMMENT_REFERENCE_MISSING_FILE || code === COMMENT_REFERENCE_MISSING_IDEA;
}

export function presentCommentReferences(
    text: string,
    sourceDir: string,
    host: CommentReferenceFileHost,
    resolvePath: (sourceDir: string, relativePath: string) => string
): CommentReferencePresentation {
    const ignoredLines = findRqIgnoreErrorTargetLines(text);
    const links: CommentReferenceLink[] = [];
    const diagnostics: CommentReferenceDiagnostic[] = [];
    for (const reference of findCommentReferencesInText(text)) {
        const issue = commentReferenceFileIssue(reference, sourceDir, host, resolvePath);
        if (!issue) {
            const targetPath = reference.path
                ? resolvePath(sourceDir, reference.path)
                : host.resolveWorkspaceIdea?.(reference.idea);
            if (targetPath) {
                links.push({
                    range: reference.range,
                    targetPath,
                    idea: reference.idea
                });
            }
            continue;
        }
        if (ignoredLines.has(reference.range.start.line)) {
            continue;
        }
        diagnostics.push(issue);
    }
    return { links, diagnostics };
}

export function presentCommentReferencesForDocument(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem?: FileSystemProvider,
    context?: PathResolveContext
): CommentReferencePresentation {
    const text = document.textDocument.getText();
    const ignoredLines = findRqIgnoreErrorTargetLines(text);
    const links: CommentReferenceLink[] = [];
    const diagnostics: CommentReferenceDiagnostic[] = [];
    for (const reference of findCommentReferencesInText(text)) {
        if (!isSlashOrBlockCommentReference(text, reference.range)) {
            continue;
        }
        const issue = commentReferenceLangiumIssue(reference, document, documents, fileSystem, context);
        if (!issue) {
            const link = commentReferenceLangiumLink(reference, document, documents, fileSystem, context);
            if (link) {
                links.push(link);
            }
            continue;
        }
        if (ignoredLines.has(reference.range.start.line)) {
            continue;
        }
        diagnostics.push(issue);
    }
    return { links, diagnostics };
}

export function collectCommentReferenceIssues(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem?: FileSystemProvider,
    context?: PathResolveContext
): CommentReferenceDiagnostic[] {
    return presentCommentReferencesForDocument(document, documents, fileSystem, context).diagnostics;
}

/**
 * Relink this document when a changed `.rq` file can change comment-reference
 * resolution (missing idea becomes present, or a targeted file changes).
 */
export function shouldRelinkCommentReferences(
    document: LangiumDocument,
    changedUris: Set<string>,
    context?: PathResolveContext
): boolean {
    const text = document.textDocument.getText();
    if (!text.includes('rq:[')) {
        return false;
    }
    if (document.diagnostics?.some(diagnostic => isCommentReferenceDiagnosticCode(diagnostic.code))) {
        return true;
    }
    for (const reference of findCommentReferencesInText(text)) {
        if (!isSlashOrBlockCommentReference(text, reference.range)) {
            continue;
        }
        if (!reference.path) {
            return true;
        }
        for (const uri of resolveImportCandidateUris(reference.path, document, context)) {
            if (changedUris.has(uri.toString())) {
                return true;
            }
        }
    }
    return false;
}

function isSlashOrBlockCommentReference(text: string, range: Range): boolean {
    const line = text.split(/\r?\n/)[range.start.line] ?? '';
    const before = line.slice(0, range.start.character);
    return before.includes('//') || before.includes('/*');
}

function commentReferenceFileIssue(
    reference: EmbeddedCommentReference,
    sourceDir: string,
    host: CommentReferenceFileHost,
    resolvePath: (sourceDir: string, relativePath: string) => string
): CommentReferenceDiagnostic | undefined {
    if (reference.path) {
        const absolutePath = resolvePath(sourceDir, reference.path);
        if (!host.exists(absolutePath)) {
            return {
                range: reference.range,
                message: commentReferenceMissingFileMessage(reference.path),
                code: COMMENT_REFERENCE_MISSING_FILE
            };
        }
        if (host.declaresIdea && !host.declaresIdea(absolutePath, reference.idea)) {
            return {
                range: reference.range,
                message: commentReferenceMissingIdeaMessage(reference.idea),
                code: COMMENT_REFERENCE_MISSING_IDEA
            };
        }
        return undefined;
    }
    if (host.workspaceDeclaresIdea && !host.workspaceDeclaresIdea(reference.idea)) {
        return {
            range: reference.range,
            message: commentReferenceMissingIdeaMessage(reference.idea),
            code: COMMENT_REFERENCE_MISSING_IDEA
        };
    }
    return undefined;
}

function commentReferenceLangiumIssue(
    reference: EmbeddedCommentReference,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem?: FileSystemProvider,
    context?: PathResolveContext
): CommentReferenceDiagnostic | undefined {
    if (reference.path) {
        if (!isResolvableImportPath(reference.path, document, documents, fileSystem, context)) {
            return {
                range: reference.range,
                message: commentReferenceMissingFileMessage(reference.path),
                code: COMMENT_REFERENCE_MISSING_FILE
            };
        }
        const neighbor = commentNeighborParse(reference.path, document, documents, fileSystem, context);
        if (neighbor) {
            if (neighborHasIdea(neighbor, reference.idea)) {
                return undefined;
            }
            return {
                range: reference.range,
                message: commentReferenceMissingIdeaMessage(reference.idea),
                code: COMMENT_REFERENCE_MISSING_IDEA
            };
        }
        if (resolveCommentReferenceIdea(reference, document, documents, context)) {
            return undefined;
        }
        return {
            range: reference.range,
            message: commentReferenceMissingIdeaMessage(reference.idea),
            code: COMMENT_REFERENCE_MISSING_IDEA
        };
    }
    if (resolveCommentReferenceIdea(reference, document, documents, context)) {
        return undefined;
    }
    return {
        range: reference.range,
        message: commentReferenceMissingIdeaMessage(reference.idea),
        code: COMMENT_REFERENCE_MISSING_IDEA
    };
}

function commentReferenceLangiumLink(
    reference: EmbeddedCommentReference,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider | undefined,
    context?: PathResolveContext
): CommentReferenceLink | undefined {
    if (reference.path) {
        const neighbor = commentNeighborParse(reference.path, document, documents, fileSystem, context);
        const idea = neighbor ? neighborIdea(neighbor, reference.idea) : undefined;
        if (neighbor && idea) {
            const target = resolveFileUri(reference.path, document, context);
            const range = ideaRangeFromNeighbor(idea);
            return {
                range: reference.range,
                targetPath: target.fsPath,
                targetUri: `${target.toString()}#L${range.start.line + 1}`,
                idea: reference.idea
            };
        }
        if (neighbor && !idea) {
            return undefined;
        }
    }
    const astIdea = resolveCommentReferenceIdea(reference, document, documents, context);
    if (astIdea) {
        const targetDocument = documents.getDocument(AstUtils.getDocument(astIdea).uri);
        if (!targetDocument) {
            return undefined;
        }
        const ideaNode = astIdea.$cstNode;
        const targetUri = ideaNode
            ? `${targetDocument.textDocument.uri}#L${ideaNode.range.start.line + 1}`
            : targetDocument.textDocument.uri;
        return {
            range: reference.range,
            targetPath: URI.parse(targetDocument.textDocument.uri).fsPath,
            targetUri,
            idea: reference.idea
        };
    }
    return undefined;
}

function commentNeighborParse(
    path: string,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider | undefined,
    context?: PathResolveContext
) {
    const target = resolveFileUri(path, document, context);
    return parseNeighborDocument(target, documents, fileSystem ?? context?.fileSystem);
}

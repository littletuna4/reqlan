/**
 * Diagnostics and document-link targets for `rq:[…]` comment references.
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import type { FileSystemProvider, LangiumDocument, LangiumDocuments } from 'langium';
import type { Range } from 'vscode-languageserver';
import {
    findCommentReferencesInText,
    resolveCommentReferenceIdea,
    type EmbeddedCommentReference
} from './reqlan-comment-resolver.js';
import { findRqIgnoreErrorTargetLines } from './reqlan-ignore-error.js';
import { findImportedDocument, isResolvableImportPath } from './reqlan-imports.js';
import type { PathResolveContext } from './reqlan-path-resolve.js';

export const COMMENT_REFERENCE_MISSING_FILE = 'comment-reference-missing-file';
export const COMMENT_REFERENCE_MISSING_IDEA = 'comment-reference-missing-idea';

export interface CommentReferenceFileHost {
    exists(absolutePath: string): boolean;
    declaresIdea?(absolutePath: string, idea: string): boolean;
    workspaceDeclaresIdea?(idea: string): boolean;
}

export interface CommentReferenceLink {
    range: Range;
    targetPath: string;
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
            if (reference.path) {
                links.push({
                    range: reference.range,
                    targetPath: resolvePath(sourceDir, reference.path),
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

export function collectCommentReferenceIssues(
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem?: FileSystemProvider,
    context?: PathResolveContext
): CommentReferenceDiagnostic[] {
    const text = document.textDocument.getText();
    const ignoredLines = findRqIgnoreErrorTargetLines(text);
    const diagnostics: CommentReferenceDiagnostic[] = [];
    for (const reference of findCommentReferencesInText(text)) {
        if (ignoredLines.has(reference.range.start.line)) {
            continue;
        }
        // .rq files use `//` / `/* */` comments. Skip `#` / triple-quote spans so
        // fenced language examples are not treated as comment references.
        if (!isSlashOrBlockCommentReference(text, reference.range)) {
            continue;
        }
        const issue = commentReferenceLangiumIssue(reference, document, documents, fileSystem, context);
        if (issue) {
            diagnostics.push(issue);
        }
    }
    return diagnostics;
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
        if (resolveCommentReferenceIdea(reference, document, documents, context)) {
            return undefined;
        }
        const imported = findImportedDocument(reference.path, document, documents, context);
        if (!imported) {
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

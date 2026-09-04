/**
 * Document links and diagnostics for `rq:[…]` tokens in non-`.rq` source comments.
 * Links and the error underline use one cached presentation so they stay in sync.
 * rq:["../../../../reqlan rq/ontology.rq".referenced_files]
 * rq:["../../../../reqlan rq/ontology.rq".reference_types]
 * rq:["../../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
 * rq:["../../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
 * rq:["../../../../reqlan rq/extension/language-support/open-file-sequencing.rq".comment_backlink_sequence]
 */
import { extractIdeaNames } from '@reqlan/analytical/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { presentCommentReferences, type CommentReferencePresentation } from '@reqlan/language';

export const COMMENT_REFERENCE_LANGUAGES = [
    'python',
    'javascript',
    'typescript',
    'typescriptreact',
    'java',
    'go',
    'rust',
    'c',
    'cpp'
];

const RQ_FILE_GLOB = '**/*.rq';

export function registerCommentReferenceDocumentLinks(context: vscode.ExtensionContext): void {
    const selector = COMMENT_REFERENCE_LANGUAGES.map(language => ({ scheme: 'file', language }));
    const diagnostics = vscode.languages.createDiagnosticCollection('reqlan-comment-references');
    const presentations = new Map<string, CommentReferencePresentation>();
    const refresh = (document: vscode.TextDocument): void => {
        if (!selector.some(item => item.language === document.languageId) || document.uri.scheme !== 'file') {
            return;
        }
        const presented = presentCommentReferences(
            document.getText(),
            path.dirname(document.uri.fsPath),
            createCommentReferenceHost(),
            path.resolve
        );
        presentations.set(document.uri.toString(), presented);
        diagnostics.set(
            document.uri,
            presented.diagnostics.map(issue => {
                const diagnostic = new vscode.Diagnostic(
                    toRange(issue.range),
                    issue.message,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = 'reqlan';
                diagnostic.code = issue.code;
                return diagnostic;
            })
        );
    };
    const refreshOpenSources = (): void => {
        for (const document of vscode.workspace.textDocuments) {
            refresh(document);
        }
    };
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefreshOpenSources = (): void => {
        if (refreshTimer !== undefined) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            refreshOpenSources();
        }, 50);
    };
    const rqWatcher = vscode.workspace.createFileSystemWatcher(RQ_FILE_GLOB);
    context.subscriptions.push(
        diagnostics,
        rqWatcher,
        { dispose: () => { if (refreshTimer !== undefined) { clearTimeout(refreshTimer); } } },
        vscode.workspace.onDidOpenTextDocument(refresh),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (isRqDocument(event.document)) {
                scheduleRefreshOpenSources();
                return;
            }
            refresh(event.document);
        }),
        vscode.workspace.onDidCloseTextDocument(document => {
            presentations.delete(document.uri.toString());
            diagnostics.delete(document.uri);
        }),
        rqWatcher.onDidCreate(() => scheduleRefreshOpenSources()),
        rqWatcher.onDidChange(() => scheduleRefreshOpenSources()),
        rqWatcher.onDidDelete(() => scheduleRefreshOpenSources()),
        vscode.languages.registerDocumentLinkProvider(selector, {
            provideDocumentLinks(document) {
                if (!document.getText().includes('rq:[')) {
                    return [];
                }
                let presented = presentations.get(document.uri.toString());
                if (!presented) {
                    refresh(document);
                    presented = presentations.get(document.uri.toString());
                }
                if (!presented) {
                    return [];
                }
                return presented.links.map(link => {
                    const documentLink = new vscode.DocumentLink(
                        toRange(link.range),
                        vscode.Uri.file(link.targetPath)
                    );
                    documentLink.tooltip = link.idea;
                    return documentLink;
                });
            }
        })
    );
    refreshOpenSources();
}

function isRqDocument(document: vscode.TextDocument): boolean {
    return document.languageId === 'reqlan' || document.fileName.toLowerCase().endsWith('.rq');
}

function createCommentReferenceHost() {
    return {
        exists: fileExists,
        declaresIdea: (absolutePath: string, idea: string) => rqFileDeclaresIdea(absolutePath, idea),
        workspaceDeclaresIdea: (idea: string) => findOpenIdeaFile(idea) !== undefined,
        resolveWorkspaceIdea: (idea: string) => findOpenIdeaFile(idea)
    };
}

function fileExists(absolutePath: string): boolean {
    const open = openDocumentAt(absolutePath);
    if (open) {
        return true;
    }
    try {
        return fs.statSync(absolutePath).isFile();
    } catch {
        return false;
    }
}

function rqFileDeclaresIdea(absolutePath: string, idea: string): boolean {
    const open = openDocumentAt(absolutePath);
    try {
        const text = open ? open.getText() : fs.readFileSync(absolutePath, 'utf8');
        return extractIdeaNames(text).includes(idea);
    } catch {
        return false;
    }
}

function findOpenIdeaFile(idea: string): string | undefined {
    for (const document of vscode.workspace.textDocuments) {
        if (!isRqDocument(document)) {
            continue;
        }
        try {
            if (extractIdeaNames(document.getText()).includes(idea)) {
                return document.uri.fsPath;
            }
        } catch {
            continue;
        }
    }
    return undefined;
}

function openDocumentAt(absolutePath: string): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(document => document.uri.fsPath === absolutePath);
}

function toRange(range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
}): vscode.Range {
    return new vscode.Range(
        range.start.line,
        range.start.character,
        range.end.line,
        range.end.character
    );
}

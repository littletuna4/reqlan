/**
 * Document links and diagnostics for `rq:[…]` tokens in non-`.rq` source comments.
 * rq:["../../../../reqlan rq/ontology.rq".referenced_files]
 * rq:["../../../../reqlan rq/ontology.rq".reference_types]
 * rq:["../../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { presentCommentReferences } from '@reqlan/language';

const COMMENT_REFERENCE_LANGUAGES = [
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

export function registerCommentReferenceDocumentLinks(context: vscode.ExtensionContext): void {
    const selector = COMMENT_REFERENCE_LANGUAGES.map(language => ({ scheme: 'file', language }));
    const diagnostics = vscode.languages.createDiagnosticCollection('reqlan-comment-references');
    const refresh = (document: vscode.TextDocument): void => {
        if (!selector.some(item => item.language === document.languageId) || document.uri.scheme !== 'file') {
            return;
        }
        const presented = presentCommentReferences(
            document.getText(),
            path.dirname(document.uri.fsPath),
            {
                exists: fileExists,
                declaresIdea: (absolutePath, idea) => rqFileDeclaresIdea(absolutePath, idea)
            },
            path.resolve
        );
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
    context.subscriptions.push(
        diagnostics,
        vscode.workspace.onDidOpenTextDocument(refresh),
        vscode.workspace.onDidChangeTextDocument(event => refresh(event.document)),
        vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri)),
        vscode.languages.registerDocumentLinkProvider(selector, {
            provideDocumentLinks(document) {
                if (!document.getText().includes('rq:[')) {
                    return [];
                }
                const presented = presentCommentReferences(
                    document.getText(),
                    path.dirname(document.uri.fsPath),
                    {
                        exists: fileExists,
                        declaresIdea: (absolutePath, idea) => rqFileDeclaresIdea(absolutePath, idea)
                    },
                    path.resolve
                );
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
    for (const document of vscode.workspace.textDocuments) {
        refresh(document);
    }
}

function fileExists(absolutePath: string): boolean {
    try {
        return fs.statSync(absolutePath).isFile();
    } catch {
        return false;
    }
}

function rqFileDeclaresIdea(absolutePath: string, idea: string): boolean {
    try {
        const text = fs.readFileSync(absolutePath, 'utf8');
        const pattern = new RegExp(`^${escapeRegExp(idea)}(?:\\s*\\{|\\s+)`, 'm');
        return pattern.test(text);
    } catch {
        return false;
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

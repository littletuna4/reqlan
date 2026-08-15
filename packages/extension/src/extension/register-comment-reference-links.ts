/**
 * Document links for `rq:[…]` tokens in non-`.rq` source comments.
 * rq:["../../../../reqlan rq/ontology.rq".referenced_files]
 * rq:["../../../../reqlan rq/ontology.rq".reference_types]
 * rq:["../../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import { findCommentReferencesInText } from '@reqlan/language';

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
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(selector, {
            provideDocumentLinks(document) {
                if (!document.getText().includes('rq:[')) {
                    return [];
                }
                const sourceDir = path.dirname(document.uri.fsPath);
                const links: vscode.DocumentLink[] = [];
                for (const ref of findCommentReferencesInText(document.getText())) {
                    if (!ref.path) {
                        continue;
                    }
                    const target = vscode.Uri.file(path.resolve(sourceDir, ref.path));
                    const link = new vscode.DocumentLink(
                        toRange(ref.range),
                        target
                    );
                    link.tooltip = ref.idea;
                    links.push(link);
                }
                return links;
            }
        })
    );
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

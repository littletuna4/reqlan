/**
 * Rebuilds documents whose outbound or comment-reference diagnostics depend on other `.rq` files.
 * Relink and validate attach to the current AST. They do not replace `parseResult`.
 * Do not relink every document that still has a Langium linker error.
 * rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".node_engine_open_path]
 */
import {
    DefaultDocumentBuilder,
    DocumentValidator,
    type LangiumDocument,
    type LangiumSharedCoreServices
} from 'langium';
import type { CancellationToken, Diagnostic } from 'vscode-languageserver';
import { shouldRelinkCommentReferences } from './reqlan-comment-diagnostics.js';
import { documentOutboundTouchesChangedUris } from './reqlan-local-symbolic-links.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';

export class ReqlanDocumentBuilder extends DefaultDocumentBuilder {
    constructor(services: LangiumSharedCoreServices) {
        super(services);
    }

    protected override shouldRelink(document: LangiumDocument, changedUris: Set<string>): boolean {
        if (this.indexManager.isAffected(document, changedUris)) {
            return true;
        }
        const pathContext = pathResolveContextFromServices({
            shared: {
                workspace: {
                    WorkspaceManager: this.workspaceManager(),
                    FileSystemProvider: this.fileSystemProvider
                }
            }
        });
        if (shouldRelinkCommentReferences(document, changedUris, pathContext)) {
            return true;
        }
        return documentOutboundTouchesChangedUris(document, changedUris, pathContext);
    }

    /**
     * Langium appends validation diagnostics when the document already has diagnostics.
     * A rebuild that is not yet Validated keeps that list and runs built-in checks again.
     * Each extra linking error becomes another copy of the same Quick Fix.
     * Remove previous built-in diagnostics before that append.
     * rq:["../../../reqlan rq/extension/language/vsc-primitives.rq".code_actions]
     */
    protected override async validate(document: LangiumDocument, cancelToken: CancellationToken): Promise<void> {
        const removed = this.rerunsBuiltInValidation(document)
            ? detachBuiltInDiagnostics(document)
            : [];
        try {
            await super.validate(document, cancelToken);
        } catch (error: unknown) {
            restoreDiagnostics(document, removed);
            throw error;
        }
    }

    private rerunsBuiltInValidation(document: LangiumDocument): boolean {
        const missing = this.findMissingValidationCategories(document, this.getBuildOptions(document));
        return missing.includes('built-in');
    }
}

const BUILT_IN_DIAGNOSTIC_CODES: ReadonlySet<string> = new Set([
    DocumentValidator.LexingError,
    DocumentValidator.ParsingError,
    DocumentValidator.LinkingError
]);

function detachBuiltInDiagnostics(document: LangiumDocument): Diagnostic[] {
    const diagnostics = document.diagnostics;
    if (!diagnostics) {
        return [];
    }
    const kept: Diagnostic[] = [];
    const removed: Diagnostic[] = [];
    for (const diagnostic of diagnostics) {
        if (isBuiltInDiagnostic(diagnostic)) {
            removed.push(diagnostic);
        } else {
            kept.push(diagnostic);
        }
    }
    if (removed.length === 0) {
        return [];
    }
    document.diagnostics = kept.length > 0 ? kept : undefined;
    return removed;
}

function restoreDiagnostics(document: LangiumDocument, removed: readonly Diagnostic[]): void {
    if (removed.length === 0) {
        return;
    }
    const current = document.diagnostics;
    document.diagnostics = current ? [...current, ...removed] : [...removed];
}

function isBuiltInDiagnostic(diagnostic: Diagnostic): boolean {
    const data = diagnostic.data;
    if (!isDiagnosticDataCode(data)) {
        return false;
    }
    return BUILT_IN_DIAGNOSTIC_CODES.has(data.code);
}

function isDiagnosticDataCode(data: unknown): data is { code: string } {
    if (typeof data !== 'object' || data === null || !('code' in data)) {
        return false;
    }
    return typeof data.code === 'string';
}

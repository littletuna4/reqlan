/**
 * The language server reads idea names from the open ideas index.
 * rq:["../../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
 */
import type * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';

export function registerNameCatalogSync(
    _context: vscode.ExtensionContext,
    _index: IndexService,
    _getClient: () => LanguageClient | undefined
): void {
    // Completion, code actions, references, and rename query the index.
}

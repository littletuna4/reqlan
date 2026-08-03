import type * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { registerCommentRenameProvider } from './register-comment-rename-provider.js';
import { registerIdeaRefactorCommands } from './register-idea-refactor-commands.js';

/**
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_support]
 */
export function registerRefactorModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    registerCommentRenameProvider(context);
    registerIdeaRefactorCommands(context, submodule.index);
}

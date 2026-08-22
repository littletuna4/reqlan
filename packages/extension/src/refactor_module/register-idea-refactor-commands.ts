import {
    REQLAN_REFACTOR_DELETE_IDEA_COMMAND,
    REQLAN_REFACTOR_MOVE_IDEA_COMMAND,
    REQLAN_REFACTOR_MOVE_IDEA_CONTENT_COMMAND,
    type IdeaRefactorCommandArgs
} from '@reqlan/language';
import * as vscode from 'vscode';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import {
    deleteIdea,
    moveIdeaToFile,
    resolveIdeaRefactorArgs
} from './idea-extract-flow.js';

/**
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_delete]
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_changes]
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".decompose]
 */
export function registerIdeaRefactorCommands(
    context: vscode.ExtensionContext,
    index: IndexService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            REQLAN_REFACTOR_DELETE_IDEA_COMMAND,
            async (args?: IdeaRefactorCommandArgs) => {
                const resolved = await resolveIdeaRefactorArgs(args);
                if (!resolved) {
                    return;
                }
                await deleteIdea(resolved, index);
            }
        ),
        vscode.commands.registerCommand(
            REQLAN_REFACTOR_MOVE_IDEA_COMMAND,
            async (args?: IdeaRefactorCommandArgs) => {
                const resolved = await resolveIdeaRefactorArgs(args);
                if (!resolved) {
                    return;
                }
                await moveIdeaToFile(resolved, index, {
                    leaveSourceStub: false,
                    openLabel: 'Move idea here'
                });
            }
        ),
        vscode.commands.registerCommand(
            REQLAN_REFACTOR_MOVE_IDEA_CONTENT_COMMAND,
            async (args?: IdeaRefactorCommandArgs) => {
                const resolved = await resolveIdeaRefactorArgs(args);
                if (!resolved) {
                    return;
                }
                await moveIdeaToFile(resolved, index, {
                    leaveSourceStub: true,
                    openLabel: 'Move idea content here'
                });
            }
        )
    );
}

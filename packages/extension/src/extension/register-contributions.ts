/**
 * Extension composition root: register product-domain modules.
 * Index engine ownership stays in `@reqlan/analytical`; this file only wires host surfaces.
 */
import type * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { registerActivityBarModule } from '../activity_bar_module/index.js';
import { registerAnalyticalCommands } from '../analytical_submodule/commands/register-commands.js';
import { registerChatParticipantModule } from '../agent_module/chat/index.js';
import { registerAiCommandsModule } from '../agent_module/ai_commands/index.js';
import { registerWebviewModule } from '../ideas_summary_module/index.js';
import { registerMutationHooksModule } from '../mutation_module/index.js';
import { registerRefactorModule } from '../mutation_module/refactor/index.js';
import { registerIndexDiagnosticsModule } from '../index_host_module/diagnostics/index.js';
import { registerGitDatesBackgroundIndexing } from '../index_host_module/register-git-dates-background.js';
import { registerExportCommands } from '../export_module/register-export-commands.js';

/** Run one registration step, logging (never throwing) so siblings still register. */
function registerStep(label: string, register: () => void): void {
    try {
        register();
    } catch (error) {
        console.error(`[reqlan] Failed to register ${label}:`, error);
    }
}

/**
 * Register every VS Code contribution synchronously.
 * Must not start indexing or await work — see activation first-paint requirements.
 */
export function registerExtensionContributions(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule,
    onActivityBarPainted: () => void
): void {
    // Activity bar first so the sidebar can resolve even if a sibling throws.
    registerStep('activity bar', () =>
        registerActivityBarModule(context, submodule, onActivityBarPainted)
    );
    registerStep('analytical commands', () => registerAnalyticalCommands(context, submodule));
    registerStep('export', () => registerExportCommands(context, submodule));
    registerStep('chat participant', () => registerChatParticipantModule(context, submodule));
    registerStep('ideas summary', () => registerWebviewModule(context, submodule));
    registerStep('AI commands', () => registerAiCommandsModule(context, submodule));
    registerStep('mutation hooks', () => registerMutationHooksModule(context, submodule));
    registerStep('refactor', () => registerRefactorModule(context, submodule));
    registerStep('index diagnostics', () => registerIndexDiagnosticsModule(context, submodule));
    registerStep('git dates background', () => registerGitDatesBackgroundIndexing(context, submodule));
}

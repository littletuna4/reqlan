import type * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { registerFileMutationHooks } from './register-file-mutation-hooks.js';

export function registerMutationHooksModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    registerFileMutationHooks(context, submodule);
}

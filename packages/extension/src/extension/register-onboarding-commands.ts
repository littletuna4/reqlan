import type * as vscode from 'vscode';
import * as vscodeApi from 'vscode';
import { openOnboardingPage } from './open-thanks-for-installing.js';

export function registerOnboardingCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscodeApi.commands.registerCommand('reqlan.showOnboarding', () => openOnboardingPage(context)),
    );
}

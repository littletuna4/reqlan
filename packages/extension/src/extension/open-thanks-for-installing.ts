import * as vscode from 'vscode';
import {
    isExtensionUpdate,
    readOnboardingStateForActivation,
    writeOnboardingState,
} from './onboarding-state.js';
import { OnboardingPanel } from './onboarding-panel.js';

export function openOnboardingPage(context: vscode.ExtensionContext): void {
    OnboardingPanel.show(context);
}

export async function openThanksForInstallingIfNeeded(
    context: vscode.ExtensionContext,
): Promise<void> {
    const currentVersion = context.extension.packageJSON.version ?? '';
    const state = readOnboardingStateForActivation(context);
    const updated = isExtensionUpdate(state, currentVersion);

    if (state.onboardingMessageShown) {
        if (updated) {
            await writeOnboardingState(context, {
                ...state,
                lastVersion: currentVersion,
            });
        }
        return;
    }

    openOnboardingPage(context);

    await writeOnboardingState(context, {
        onboardingMessageShown: true,
        lastVersion: currentVersion,
    });
}

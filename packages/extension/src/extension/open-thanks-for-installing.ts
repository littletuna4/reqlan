import * as vscode from 'vscode';
import {
    isExtensionUpdate,
    readOnboardingStateForActivation,
    writeOnboardingState,
} from './onboarding-state.js';

const ONBOARDING_PATH = ['media', 'thanks-for-installing.rq'] as const;

export async function openOnboardingPage(context: vscode.ExtensionContext): Promise<void> {
    const onboardingUri = vscode.Uri.joinPath(context.extensionUri, ...ONBOARDING_PATH);
    const onboardingBytes = await vscode.workspace.fs.readFile(onboardingUri);

    const document = await vscode.workspace.openTextDocument({
        content: onboardingBytes.toString(),
        language: 'reqlan',
    });
    await vscode.window.showTextDocument(document, { preview: false });
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

    await openOnboardingPage(context);

    await writeOnboardingState(context, {
        onboardingMessageShown: true,
        lastVersion: currentVersion,
    });
}

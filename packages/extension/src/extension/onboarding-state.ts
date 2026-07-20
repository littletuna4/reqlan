import type { ExtensionContext } from 'vscode';

/** Matches `vscode.ExtensionMode.Development` without a runtime `vscode` import. */
export const EXTENSION_MODE_DEVELOPMENT = 2;

/** VS Code `ExtensionContext.globalState` key for onboarding persistence. */
export const ONBOARDING_STORAGE_KEY = 'onboarding';

export type OnboardingState = {
    onboardingMessageShown: boolean;
    lastVersion: string;
};

const LEGACY_STORAGE_KEY = 'reqlan.thanksForInstallingShown';

const DEFAULT_STATE: OnboardingState = {
    onboardingMessageShown: false,
    lastVersion: '',
};

export function readOnboardingState(context: ExtensionContext): OnboardingState {
    const stored = context.globalState.get<Partial<OnboardingState>>(ONBOARDING_STORAGE_KEY);
    if (stored) {
        return {
            onboardingMessageShown: stored.onboardingMessageShown ?? false,
            lastVersion: stored.lastVersion ?? '',
        };
    }

    if (context.globalState.get<boolean>(LEGACY_STORAGE_KEY)) {
        return {
            onboardingMessageShown: true,
            lastVersion: context.extension.packageJSON.version ?? '',
        };
    }

    return { ...DEFAULT_STATE };
}

export function readOnboardingStateForActivation(context: ExtensionContext): OnboardingState {
    // Extension dev hosts share the main Cursor/VS Code profile, so --user-data-dir and
    // --profile-temp do not isolate globalState. Treat every dev activation as first-run.
    if (context.extensionMode === EXTENSION_MODE_DEVELOPMENT) {
        return { ...DEFAULT_STATE };
    }

    return readOnboardingState(context);
}

export function writeOnboardingState(
    context: ExtensionContext,
    state: OnboardingState,
): Thenable<void> {
    return context.globalState.update(ONBOARDING_STORAGE_KEY, state);
}

export function isExtensionUpdate(
    state: OnboardingState,
    currentVersion: string,
): boolean {
    return state.lastVersion !== '' && state.lastVersion !== currentVersion;
}

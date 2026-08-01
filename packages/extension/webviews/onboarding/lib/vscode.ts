import type { OnboardingToExtensionMessage } from '../../../src/extension/onboarding-messages.js';

interface VsCodeApi {
    postMessage(message: OnboardingToExtensionMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
    api ??= acquireVsCodeApi();
    return api;
}

export function postToExtension(message: OnboardingToExtensionMessage): void {
    getVsCodeApi().postMessage(JSON.parse(JSON.stringify(message)) as OnboardingToExtensionMessage);
}

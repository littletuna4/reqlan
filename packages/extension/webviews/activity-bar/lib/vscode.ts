import type { ActivityBarToExtensionMessage } from '../../../src/activity_bar_module/activity-bar-messages.js';

interface VsCodeApi {
    postMessage(message: ActivityBarToExtensionMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
    if (!api) {
        api = acquireVsCodeApi();
    }
    return api;
}

/** JSON-clone so Svelte $state proxies are structured-clone safe. */
export function postToExtension(message: ActivityBarToExtensionMessage): void {
    getVsCodeApi().postMessage(JSON.parse(JSON.stringify(message)) as ActivityBarToExtensionMessage);
}

import type { WebviewToExtensionMessage } from '../../../src/webview_module/shared/messages.js';

interface VsCodeApi {
    postMessage(message: WebviewToExtensionMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
    api ??= acquireVsCodeApi();
    return api;
}

export function postToExtension(message: WebviewToExtensionMessage): void {
    getVsCodeApi().postMessage(message);
}

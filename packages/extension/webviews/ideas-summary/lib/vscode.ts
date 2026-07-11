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

/**
 * Post to the extension host. Always structured-clone via JSON so Svelte 5
 * `$state` proxies (and other non-cloneable wrappers) never hit MessagePort.
 */
export function postToExtension(message: WebviewToExtensionMessage): void {
    const plain = JSON.parse(JSON.stringify(message)) as WebviewToExtensionMessage;
    getVsCodeApi().postMessage(plain);
}

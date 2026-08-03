import type { IndexDiagnosticsToExtensionMessage } from '../../../src/diagnostics_module/index-diagnostics-messages.js';

interface VsCodeApi {
    postMessage(message: IndexDiagnosticsToExtensionMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
    api ??= acquireVsCodeApi();
    return api;
}

export function postToExtension(message: IndexDiagnosticsToExtensionMessage): void {
    getVsCodeApi().postMessage(JSON.parse(JSON.stringify(message)) as IndexDiagnosticsToExtensionMessage);
}

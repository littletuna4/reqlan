import type { ExportFormToExtensionMessage } from '../../../src/analytical_submodule/export/export-form-messages.js';

interface VsCodeApi {
    postMessage(message: ExportFormToExtensionMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
    api ??= acquireVsCodeApi();
    return api;
}

export function postToExtension(message: ExportFormToExtensionMessage): void {
    getVsCodeApi().postMessage(JSON.parse(JSON.stringify(message)) as ExportFormToExtensionMessage);
}

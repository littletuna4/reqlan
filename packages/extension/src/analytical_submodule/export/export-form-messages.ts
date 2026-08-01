/** Message types for the HTML export form webview. */
import type { ExportFormSettings } from './export-form-settings-types.js';

export type ExportFormInitPayload = {
    settings: ExportFormSettings;
    /** Absolute path shown in the UI for the resolved output directory. */
    resolvedOutputDir: string;
    workspaceRoot: string;
    canExportCurrentFile: boolean;
    activeRqFileName?: string;
    settingsPath: string;
};

export type ExtensionToExportFormMessage =
    | {
        type: 'init';
        payload: ExportFormInitPayload;
    }
    | {
        type: 'outputDirPicked';
        outputDir: string;
        resolvedOutputDir: string;
    }
    | {
        type: 'exportStarted';
    }
    | {
        type: 'exportFinished';
        ok: boolean;
        message: string;
    }
    | {
        type: 'settingsSaved';
        ok: boolean;
        message: string;
    };

export type ExportFormToExtensionMessage =
    | { type: 'ready' }
    | { type: 'pickOutputDir'; currentOutputDir: string }
    | { type: 'saveSettings'; settings: ExportFormSettings }
    | { type: 'runExport'; settings: ExportFormSettings };

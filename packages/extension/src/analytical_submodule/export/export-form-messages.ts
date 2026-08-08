/** Message types for the multi-format export form webview. */
import type { ExportFormFormat, ExportFormSettings } from './export-form-settings-types.js';

export type ExportFormBaseOption = {
    id: string;
    label: string;
    root: string;
};

export type ExportFormInitPayload = {
    settings: ExportFormSettings;
    /** Absolute path shown in the UI for the resolved output directory. */
    resolvedOutputDir: string;
    /** Selected base root (settings + export scope). */
    baseRoot: string;
    selectedBaseId: string;
    bases: ExportFormBaseOption[];
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
        type: 'exportProgress';
        message: string;
        phase?: 'prepare' | 'snapshot' | 'write';
        completed?: number;
        total?: number;
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
    | { type: 'selectBase'; baseId: string }
    | { type: 'saveSettings'; settings: ExportFormSettings }
    | { type: 'runExport'; settings: ExportFormSettings };

export type { ExportFormFormat };

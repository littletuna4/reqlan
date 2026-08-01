/**
 * Persist HTML export form defaults under `<workspace>/.reqlan/export_settings.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { resolveApplicationMemoryPath } from '@reqlan/analytical';
import {
    EXPORT_SETTINGS_FILENAME,
    defaultExportFormSettings,
    mergeExportFormSettings,
    type ExportFormSettings
} from './export-form-settings-types.js';

export {
    EXPORT_SETTINGS_FILENAME,
    defaultExportFormSettings,
    mergeExportFormSettings,
    type ExportFormSettings
} from './export-form-settings-types.js';

export function exportSettingsPath(workspaceRoot: string): string {
    return join(resolveApplicationMemoryPath(workspaceRoot), EXPORT_SETTINGS_FILENAME);
}

export function loadExportFormSettings(workspaceRoot: string): ExportFormSettings {
    const defaults = defaultExportFormSettings(workspaceRoot);
    const path = exportSettingsPath(workspaceRoot);
    if (!existsSync(path)) {
        return defaults;
    }
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ExportFormSettings>;
        return mergeExportFormSettings(defaults, raw);
    } catch {
        return defaults;
    }
}

export function saveExportFormSettings(
    workspaceRoot: string,
    settings: ExportFormSettings
): void {
    const memoryDir = resolveApplicationMemoryPath(workspaceRoot);
    mkdirSync(memoryDir, { recursive: true });
    const toStore: ExportFormSettings = {
        ...settings,
        version: 1,
        outputDir: toStoredOutputDir(workspaceRoot, settings.outputDir),
        exportName: settings.exportName.trim() || 'reqlan-export',
        urlBase: settings.urlBase.trim(),
        headerHref: settings.headerHref.trim(),
        headerLabel: settings.headerLabel.trim(),
        printEntryFileName: settings.printEntryFileName.trim() || 'print.html'
    };
    writeFileSync(exportSettingsPath(workspaceRoot), `${JSON.stringify(toStore, null, 2)}\n`, 'utf8');
}

/** Resolve stored outputDir to an absolute filesystem path. */
export function resolveOutputDir(workspaceRoot: string, outputDir: string): string {
    const trimmed = outputDir.trim();
    if (!trimmed) {
        return resolve(workspaceRoot, 'reqlan-export');
    }
    return isAbsolute(trimmed) ? trimmed : resolve(workspaceRoot, trimmed);
}

function toStoredOutputDir(workspaceRoot: string, outputDir: string): string {
    const absolute = resolveOutputDir(workspaceRoot, outputDir);
    const rel = relative(workspaceRoot, absolute);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
        return rel;
    }
    return absolute;
}

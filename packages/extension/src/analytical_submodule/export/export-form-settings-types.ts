/**
 * Shared HTML export form settings shape (extension host + webview).
 * Persistence lives in `export-settings.ts` (Node fs); keep this file free of Node APIs.
 */
import type {
    ExportClusterStrategy,
    ExportRuntimeMode,
    ExportScope
} from '@reqlan/analytical';

export const EXPORT_SETTINGS_FILENAME = 'export_settings.json';

export interface ExportFormSettings {
    version: 1;
    scope: ExportScope;
    /** Absolute path, or workspace-relative when under the workspace root. */
    outputDir: string;
    exportName: string;
    templateId: string;
    runtimeMode: ExportRuntimeMode;
    clusterStrategy: ExportClusterStrategy;
    includeRequirementsPage: boolean;
    includeGraphPage: boolean;
    includeIdeaPages: boolean;
    includeFilePages: boolean;
    includeCodeFilePages: boolean;
    includeClusterPages: boolean;
    includeAttributePages: boolean;
    includePrintPages: boolean;
    excludeSecretFiles: boolean;
    excludeIgnoredFiles: boolean;
    urlBase: string;
    headerHref: string;
    headerLabel: string;
    printEntryFileName: string;
    maxGraphNodes: number;
    /** Whether the advanced settings section was expanded last time. */
    advancedExpanded: boolean;
}

export function defaultExportFormSettings(_workspaceRoot?: string): ExportFormSettings {
    return {
        version: 1,
        scope: 'workspace',
        outputDir: 'reqlan-export',
        exportName: 'reqlan-export',
        templateId: 'default',
        runtimeMode: 'interactive',
        clusterStrategy: 'hybrid',
        includeRequirementsPage: true,
        includeGraphPage: true,
        includeIdeaPages: true,
        includeFilePages: true,
        includeCodeFilePages: true,
        includeClusterPages: true,
        includeAttributePages: true,
        includePrintPages: true,
        excludeSecretFiles: false,
        excludeIgnoredFiles: false,
        urlBase: '',
        headerHref: '',
        headerLabel: '',
        printEntryFileName: 'print.html',
        maxGraphNodes: 120,
        advancedExpanded: false
    };
}

export function mergeExportFormSettings(
    defaults: ExportFormSettings,
    raw: Partial<ExportFormSettings>
): ExportFormSettings {
    return {
        version: 1,
        scope: raw.scope === 'currentFile' || raw.scope === 'workspace' ? raw.scope : defaults.scope,
        outputDir: typeof raw.outputDir === 'string' && raw.outputDir.trim()
            ? raw.outputDir.trim()
            : defaults.outputDir,
        exportName: typeof raw.exportName === 'string' && raw.exportName.trim()
            ? raw.exportName.trim()
            : defaults.exportName,
        templateId: typeof raw.templateId === 'string' && raw.templateId.trim()
            ? raw.templateId.trim()
            : defaults.templateId,
        runtimeMode: isRuntimeMode(raw.runtimeMode) ? raw.runtimeMode : defaults.runtimeMode,
        clusterStrategy: isClusterStrategy(raw.clusterStrategy)
            ? raw.clusterStrategy
            : defaults.clusterStrategy,
        includeRequirementsPage: bool(raw.includeRequirementsPage, defaults.includeRequirementsPage),
        includeGraphPage: bool(raw.includeGraphPage, defaults.includeGraphPage),
        includeIdeaPages: bool(raw.includeIdeaPages, defaults.includeIdeaPages),
        includeFilePages: bool(raw.includeFilePages, defaults.includeFilePages),
        includeCodeFilePages: bool(raw.includeCodeFilePages, defaults.includeCodeFilePages),
        includeClusterPages: bool(raw.includeClusterPages, defaults.includeClusterPages),
        includeAttributePages: bool(raw.includeAttributePages, defaults.includeAttributePages),
        includePrintPages: bool(raw.includePrintPages, defaults.includePrintPages),
        excludeSecretFiles: bool(raw.excludeSecretFiles, defaults.excludeSecretFiles),
        excludeIgnoredFiles: bool(raw.excludeIgnoredFiles, defaults.excludeIgnoredFiles),
        urlBase: typeof raw.urlBase === 'string' ? raw.urlBase : defaults.urlBase,
        headerHref: typeof raw.headerHref === 'string' ? raw.headerHref : defaults.headerHref,
        headerLabel: typeof raw.headerLabel === 'string' ? raw.headerLabel : defaults.headerLabel,
        printEntryFileName: typeof raw.printEntryFileName === 'string' && raw.printEntryFileName.trim()
            ? raw.printEntryFileName.trim()
            : defaults.printEntryFileName,
        maxGraphNodes: typeof raw.maxGraphNodes === 'number' && Number.isFinite(raw.maxGraphNodes) && raw.maxGraphNodes > 0
            ? Math.floor(raw.maxGraphNodes)
            : defaults.maxGraphNodes,
        advancedExpanded: bool(raw.advancedExpanded, defaults.advancedExpanded)
    };
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function isRuntimeMode(value: unknown): value is ExportRuntimeMode {
    return value === 'interactive' || value === 'document' || value === 'print';
}

function isClusterStrategy(value: unknown): value is ExportClusterStrategy {
    return value === 'deterministic' || value === 'hybrid';
}

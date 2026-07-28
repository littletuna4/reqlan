/**
 * Resolves document-relative and import-root-aliased paths (default `@/`).
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_location]
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
 * rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
 */
import type { FileSystemProvider, LangiumDocument, URI } from 'langium';
import { URI as UriCtor, UriUtils } from 'langium';

export const DEFAULT_IMPORT_ROOT_ALIAS = '@';
export const RQCONFIG_FILENAME = '.rqconfig.json';

export interface ImportRootMapping {
    alias: string;
    /** Absolute URI of that alias’s import-root directory, when set. */
    rootUri?: URI;
}

export type RqExportScope = 'workspace' | 'currentFile';
export type RqExportRuntimeMode = 'interactive' | 'document' | 'print';
export type RqExportClusterStrategy = 'deterministic' | 'hybrid';

export interface RqHtmlExportConfig {
    printEntryFileName?: string;
    includeRequirementsPage?: boolean;
    includeGraphPage?: boolean;
    runtimeMode?: RqExportRuntimeMode;
    clusterStrategy?: RqExportClusterStrategy;
    includeIdeaPages?: boolean;
    includeFilePages?: boolean;
    includeClusterPages?: boolean;
    includePrintPages?: boolean;
}

export interface RqExportConfig {
    outputFolder?: string;
    templateId?: string;
    scope?: RqExportScope;
    html?: RqHtmlExportConfig;
}

export interface RqConfig {
    importRoots: ImportRootMapping[];
    export?: RqExportConfig;
}

export interface PathResolveContext {
    /** Workspace folders that contain documents (longest match wins). */
    workspaceFolderUris?: readonly URI[];
    /** Explicit workspace folder for tests; preferred over list lookup when set. */
    workspaceFolderUri?: URI;
    fileSystem?: FileSystemProvider;
    /**
     * Preloaded config. `undefined` loads nearest `.rqconfig.json` when fileSystem is set.
     * `null` skips loading and uses defaults only.
     */
    config?: RqConfig | null;
}

export function defaultRqConfig(): RqConfig {
    return { importRoots: [{ alias: DEFAULT_IMPORT_ROOT_ALIAS }] };
}

export function matchImportRootAlias(path: string, alias: string): string | undefined {
    if (!alias || !path.startsWith(alias)) {
        return undefined;
    }
    const afterAlias = path.slice(alias.length);
    if (!afterAlias.startsWith('/')) {
        return undefined;
    }
    return afterAlias.slice(1);
}

/** Longest matching alias wins when several mappings could apply. */
export function matchImportRootMapping(
    path: string,
    mappings: readonly ImportRootMapping[]
): { mapping: ImportRootMapping; remainder: string } | undefined {
    const ordered = [...mappings]
        .filter(mapping => mapping.alias.length > 0)
        .sort((left, right) => right.alias.length - left.alias.length);
    for (const mapping of ordered) {
        const remainder = matchImportRootAlias(path, mapping.alias);
        if (remainder !== undefined) {
            return { mapping, remainder };
        }
    }
    return undefined;
}

export function findWorkspaceFolderUri(
    documentUri: URI,
    folderUris: readonly URI[] | undefined
): URI | undefined {
    if (!folderUris || folderUris.length === 0) {
        return undefined;
    }
    const documentPath = documentUri.toString();
    let best: URI | undefined;
    let bestLength = -1;
    for (const folder of folderUris) {
        const folderPath = folder.path.endsWith('/')
            ? folder.toString()
            : `${folder.toString()}/`;
        const folderBase = folder.toString();
        if (documentPath === folderBase || documentPath.startsWith(folderPath)) {
            const length = folderBase.length;
            if (length > bestLength) {
                best = folder;
                bestLength = length;
            }
        }
    }
    return best;
}

export function loadApplyingRqConfig(
    startDirUri: URI,
    fileSystem: FileSystemProvider
): RqConfig | undefined {
    let dir = startDirUri;
    for (;;) {
        const configUri = UriUtils.joinPath(dir, RQCONFIG_FILENAME);
        if (fileSystem.existsSync(configUri) && !fileSystem.statSync(configUri).isDirectory) {
            return parseRqConfig(configUri, fileSystem);
        }
        const parent = UriUtils.dirname(dir);
        if (UriUtils.equals(parent, dir)) {
            return undefined;
        }
        dir = parent;
    }
}

function parseRqConfig(configUri: URI, fileSystem: FileSystemProvider): RqConfig | undefined {
    let raw: unknown;
    try {
        raw = JSON.parse(fileSystem.readFileSync(configUri));
    } catch {
        return undefined;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    const importRoots = parseImportRoots(record.importRoots, configUri);
    if (record.importRoots !== undefined && importRoots === undefined) {
        return undefined;
    }
    const parsedExport = parseExportConfig(record.export, UriUtils.dirname(configUri));
    const config: RqConfig = {
        importRoots: importRoots ?? defaultRqConfig().importRoots
    };
    if (parsedExport) {
        config.export = parsedExport;
    }
    return config;
}

function parseImportRootEntry(entry: unknown, configDir: URI): ImportRootMapping | undefined {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return undefined;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.alias !== 'string' || record.alias.length === 0) {
        return undefined;
    }
    const mapping: ImportRootMapping = { alias: record.alias };
    if (typeof record.root === 'string' && record.root.length > 0) {
        mapping.rootUri = isAbsoluteUriOrPath(record.root)
            ? toDirectoryUri(record.root)
            : UriUtils.resolvePath(configDir, record.root);
    }
    return mapping;
}

function parseImportRoots(raw: unknown, configUri: URI): ImportRootMapping[] | undefined {
    if (raw === undefined) {
        return undefined;
    }
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const configDir = UriUtils.dirname(configUri);
    const importRoots: ImportRootMapping[] = [];
    for (const entry of raw) {
        const mapping = parseImportRootEntry(entry, configDir);
        if (mapping) {
            importRoots.push(mapping);
        }
    }
    return importRoots.length > 0 ? importRoots : defaultRqConfig().importRoots;
}

function parseExportConfig(raw: unknown, configDir: URI): RqExportConfig | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    const config: RqExportConfig = {};

    if (typeof record.outputFolder === 'string' && record.outputFolder.trim().length > 0) {
        config.outputFolder = isAbsoluteUriOrPath(record.outputFolder)
            ? toDirectoryUri(record.outputFolder).fsPath
            : UriUtils.resolvePath(configDir, record.outputFolder).fsPath;
    }
    if (typeof record.templateId === 'string' && record.templateId.trim().length > 0) {
        config.templateId = record.templateId.trim();
    }
    if (record.scope === 'workspace' || record.scope === 'currentFile') {
        config.scope = record.scope;
    }
    const html = parseHtmlExportConfig(record.html);
    if (html) {
        config.html = html;
    }

    return Object.keys(config).length > 0 ? config : undefined;
}

function parseHtmlExportConfig(raw: unknown): RqHtmlExportConfig | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    const config: RqHtmlExportConfig = {};
    if (typeof record.printEntryFileName === 'string' && record.printEntryFileName.trim().length > 0) {
        config.printEntryFileName = record.printEntryFileName.trim();
    }
    if (typeof record.includeRequirementsPage === 'boolean') {
        config.includeRequirementsPage = record.includeRequirementsPage;
    }
    if (typeof record.includeGraphPage === 'boolean') {
        config.includeGraphPage = record.includeGraphPage;
    }
    if (record.runtimeMode === 'interactive' || record.runtimeMode === 'document' || record.runtimeMode === 'print') {
        config.runtimeMode = record.runtimeMode;
    }
    if (record.clusterStrategy === 'deterministic' || record.clusterStrategy === 'hybrid') {
        config.clusterStrategy = record.clusterStrategy;
    }
    if (typeof record.includeIdeaPages === 'boolean') {
        config.includeIdeaPages = record.includeIdeaPages;
    }
    if (typeof record.includeFilePages === 'boolean') {
        config.includeFilePages = record.includeFilePages;
    }
    if (typeof record.includeClusterPages === 'boolean') {
        config.includeClusterPages = record.includeClusterPages;
    }
    if (typeof record.includePrintPages === 'boolean') {
        config.includePrintPages = record.includePrintPages;
    }
    return Object.keys(config).length > 0 ? config : undefined;
}

function isAbsoluteUriOrPath(value: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith('/');
}

function toDirectoryUri(value: string): URI {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
        return UriCtor.parse(value);
    }
    return UriCtor.file(value);
}

export function resolveRqConfig(document: LangiumDocument, context?: PathResolveContext): RqConfig {
    if (context?.config === null) {
        return defaultRqConfig();
    }
    if (context?.config) {
        return context.config;
    }
    if (context?.fileSystem) {
        const loaded = loadApplyingRqConfig(UriUtils.dirname(document.uri), context.fileSystem);
        if (loaded) {
            return loaded;
        }
    }
    return defaultRqConfig();
}

export function resolveImportRootUri(
    document: LangiumDocument,
    context: PathResolveContext | undefined,
    mapping: ImportRootMapping
): URI | undefined {
    if (mapping.rootUri) {
        return mapping.rootUri;
    }
    if (context?.workspaceFolderUri) {
        return context.workspaceFolderUri;
    }
    return findWorkspaceFolderUri(document.uri, context?.workspaceFolderUris);
}

/**
 * Resolves a path string against the document directory, or against an import root when aliased.
 */
export function resolveDocumentPathUri(
    path: string,
    document: LangiumDocument,
    context?: PathResolveContext
): URI {
    const config = resolveRqConfig(document, context);
    const matched = matchImportRootMapping(path, config.importRoots);
    if (!matched) {
        return UriUtils.resolvePath(UriUtils.dirname(document.uri), path);
    }
    const importRoot = resolveImportRootUri(document, context, matched.mapping);
    if (!importRoot) {
        return UriUtils.resolvePath(UriUtils.dirname(document.uri), path);
    }
    return UriUtils.resolvePath(importRoot, matched.remainder);
}

export function workspaceFolderUrisFromManager(
    folders: ReadonlyArray<{ uri: string }> | undefined
): URI[] {
    if (!folders) {
        return [];
    }
    return folders.map(folder => UriCtor.parse(folder.uri));
}

export function pathResolveContextFromServices(services: {
    shared: {
        workspace: {
            WorkspaceManager: { workspaceFolders?: ReadonlyArray<{ uri: string }> };
            FileSystemProvider: FileSystemProvider;
        };
    };
}): PathResolveContext {
    return {
        fileSystem: services.shared.workspace.FileSystemProvider,
        workspaceFolderUris: workspaceFolderUrisFromManager(
            services.shared.workspace.WorkspaceManager.workspaceFolders
        )
    };
}

import type {
    AncestorChainResult,
    IdeaAttributeMap,
    IdeaSummary,
    ReferenceListRow
} from '../core/types.js';
import type { GraphViewSlice } from '../index-store/webview-graph-queries.js';

export type ExportFormat = 'html' | 'pdf' | 'markdown' | 'json' | 'csv';
export type ExportScope = 'workspace' | 'currentFile';
export type ExportRuntimeMode = 'interactive' | 'document' | 'print';
export type ExportClusterStrategy = 'deterministic' | 'hybrid';
export type ExportClusterKind = 'file' | 'folder' | 'tag' | 'status' | 'community';

/** Optional chrome link shown in the export topbar (e.g. back to a parent site). */
export interface ExportHeaderLink {
    href: string;
    label: string;
}

export interface ExportRequest {
    format: ExportFormat;
    outputDir: string;
    exportName: string;
    workspaceRoot: string;
    templateId: string;
    scope: ExportScope;
    sourceFileUri?: string;
    includeRequirementsPage: boolean;
    includeGraphPage: boolean;
    printEntryFileName: string;
    maxGraphNodes?: number;
    runtimeMode?: ExportRuntimeMode;
    clusterStrategy?: ExportClusterStrategy;
    includeIdeaPages?: boolean;
    includeFilePages?: boolean;
    includeCodeFilePages?: boolean;
    includeClusterPages?: boolean;
    includeAttributePages?: boolean;
    includePrintPages?: boolean;
    /**
     * When true, omit ideas hosted in `*.secret.rq` files (and their local graph
     * footprint) from the export. Used for public site / published specs.
     */
    excludeSecretFiles?: boolean;
    /**
     * When true, omit ideas hosted in paths matched by `.reqlan/.rqignore`
     * (including built-in defaults). Useful when ignored files were indexed via
     * watchers or force-include rules and should stay out of a published export.
     */
    excludeIgnoredFiles?: boolean;
    /**
     * Absolute URL prefix for the export mount (e.g. `/spec` or `/reqlan/spec`).
     * When set, page and asset hrefs are root-relative so static hosts resolve
     * correctly with or without a trailing slash on directory URLs.
     */
    urlBase?: string;
    /** Optional topbar link back to a parent site or home page. */
    headerLink?: ExportHeaderLink;
}

export interface ExportCounts {
    ideas: number;
    edges: number;
    files: number;
    clusters: number;
}

export interface ExportSearchDocument {
    id: string;
    title: string;
    kind: 'idea' | 'file' | 'cluster' | 'attribute' | 'code-file';
    summary: string;
    url: string;
    tags: string[];
    status?: string;
    pathTokens: string[];
    keywords: string[];
}

export interface ExportPageInfo {
    title: string;
    path: string;
    url: string;
    section?: string;
    printablePath?: string;
    printableUrl?: string;
}

export interface ExportManifest {
    home: ExportPageInfo;
    ideasIndex: ExportPageInfo;
    filesIndex: ExportPageInfo;
    clustersIndex: ExportPageInfo;
    attributesIndex: ExportPageInfo;
    codeFilesIndex: ExportPageInfo;
    graph: ExportPageInfo;
    printHome: ExportPageInfo;
    dataExport: ExportPageInfo;
    dataGraph: ExportPageInfo;
    dataSearch: ExportPageInfo;
    dataManifest: ExportPageInfo;
}

export interface ExportPageOptions {
    includeIdeaPages: boolean;
    includeFilePages: boolean;
    includeCodeFilePages: boolean;
    includeClusterPages: boolean;
    includeAttributePages: boolean;
    includePrintPages: boolean;
    includeRequirementsPage: boolean;
    includeGraphPage: boolean;
}

export interface ExportIdeaReferenceGroups {
    inbound: ReferenceListRow[];
    outbound: ReferenceListRow[];
    unresolved: ReferenceListRow[];
    nearby: ReferenceListRow[];
}

export interface ExportIdeaRecord extends IdeaSummary {
    fileName: string;
    fileSegments: string[];
    attributes: IdeaAttributeMap;
    page: ExportPageInfo;
    references: ExportIdeaReferenceGroups;
    ancestors: AncestorChainResult;
    clusterIds: string[];
}

export interface ExportFileRecord {
    id: string;
    fileUri: string;
    name: string;
    directory: string;
    page: ExportPageInfo;
    printPage: ExportPageInfo;
    ideas: ExportIdeaRecord[];
    edgeCount: number;
    statuses: Record<string, number>;
    tags: Record<string, number>;
}

/** Outbound file_reference target (code/source or other non-hosting file). */
export interface ExportCodeFileRecord {
    id: string;
    fileUri: string;
    name: string;
    directory: string;
    page: ExportPageInfo;
    printPage: ExportPageInfo;
    referencingIdeaIds: string[];
    labels: string[];
}

export interface ExportClusterRecord {
    id: string;
    kind: ExportClusterKind;
    label: string;
    description: string;
    page: ExportPageInfo;
    ideaIds: string[];
    fileUris: string[];
    counts: {
        ideas: number;
        files: number;
        inbound: number;
        outbound: number;
    };
}

export interface ExportAttributeValueRecord {
    value: string;
    count: number;
    ideaIds: string[];
}

export interface ExportAttributeRecord {
    key: string;
    ideaCount: number;
    values: ExportAttributeValueRecord[];
    ideaIds: string[];
    page: ExportPageInfo;
}

export interface ExportGraphCatalog {
    workspace: GraphViewSlice;
    byIdeaId: Record<string, GraphViewSlice>;
    byFileId: Record<string, GraphViewSlice>;
    byClusterId: Record<string, GraphViewSlice>;
}

export interface ExportSnapshot {
    title: string;
    generatedAt: string;
    workspaceRoot: string;
    templateId: string;
    scope: ExportScope;
    sourceFileUri?: string;
    runtimeMode: ExportRuntimeMode;
    clusterStrategy: ExportClusterStrategy;
    pageOptions: ExportPageOptions;
    /** Normalized mount prefix when request.urlBase was set (no trailing slash). */
    urlBase?: string;
    headerLink?: ExportHeaderLink;
    manifest: ExportManifest;
    counts: ExportCounts;
    ideas: ExportIdeaRecord[];
    ideaOrder: string[];
    ideasById: Record<string, ExportIdeaRecord>;
    files: ExportFileRecord[];
    filesById: Record<string, ExportFileRecord>;
    codeFiles: ExportCodeFileRecord[];
    codeFilesById: Record<string, ExportCodeFileRecord>;
    clusters: ExportClusterRecord[];
    clustersById: Record<string, ExportClusterRecord>;
    attributes: ExportAttributeRecord[];
    attributesByKey: Record<string, ExportAttributeRecord>;
    graphs: ExportGraphCatalog;
    searchDocuments: ExportSearchDocument[];
    byStatus: Record<string, number>;
    byTag: Record<string, number>;
    allFiles: string[];
}

export interface ExportResult {
    outputDir: string;
    indexFilePath: string;
    printFilePath: string;
    requirementsFilePath?: string;
    graphFilePath?: string;
    dataFilePath: string;
    ideasIndexFilePath?: string;
    filesIndexFilePath?: string;
    clustersIndexFilePath?: string;
    attributesIndexFilePath?: string;
    codeFilesIndexFilePath?: string;
    manifestFilePath?: string;
}

/** Coarse phases reported while building an HTML export. */
export type ExportProgressPhase = 'snapshot' | 'write';

/** Progress event for hosts that show export loading UI (extension webview, CLI). */
export interface ExportProgress {
    phase: ExportProgressPhase;
    /** Human-readable status for the current step. */
    message: string;
    /** Completed units within this phase (e.g. pages written). */
    completed?: number;
    /** Total units for this phase when known. */
    total?: number;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

import type { GraphViewSlice } from '../index-store/webview-graph-queries.js';
import type { IdeaSummary } from '../core/types.js';

export type ExportFormat = 'html' | 'pdf';
export type ExportScope = 'workspace' | 'currentFile';

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
}

export interface ExportCounts {
    ideas: number;
    edges: number;
    files: number;
}

export interface ExportSnapshot {
    title: string;
    generatedAt: string;
    workspaceRoot: string;
    templateId: string;
    scope: ExportScope;
    sourceFileUri?: string;
    counts: ExportCounts;
    ideas: IdeaSummary[];
    graph: GraphViewSlice;
    byStatus: Record<string, number>;
    byTag: Record<string, number>;
    files: string[];
}

export interface ExportResult {
    outputDir: string;
    indexFilePath: string;
    printFilePath: string;
    requirementsFilePath?: string;
    graphFilePath?: string;
    dataFilePath: string;
}

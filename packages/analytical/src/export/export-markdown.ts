import type { SqliteIndexStore } from '../index-store/sqlite-store.js';
import { buildExportSnapshot } from './build-export-snapshot.js';
import type {
    ExportProgressCallback,
    ExportRequest,
    ExportResult
} from './types.js';
import { writeMarkdownExport } from './write-markdown-export.js';

/** Build a snapshot and write a multi-file markdown export. */
export async function exportMarkdown(
    store: SqliteIndexStore,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    onProgress?.({
        phase: 'snapshot',
        message: 'Building export snapshot…',
    });
    const snapshot = await buildExportSnapshot(store, {
        ...request,
        format: 'markdown',
        // Markdown is document-oriented; skip interactive HTML-only families by default.
        includeGraphPage: false,
        includeRequirementsPage: false,
        includePrintPages: false,
        includeCodeFilePages: false,
        includeClusterPages: false,
        includeAttributePages: false,
        runtimeMode: request.runtimeMode ?? 'document',
    }, onProgress);
    return writeMarkdownExport(snapshot, request, onProgress);
}

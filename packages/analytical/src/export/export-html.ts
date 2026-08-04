import type { SqliteIndexStore } from '../index-store/sqlite-store.js';
import { buildExportSnapshot } from './build-export-snapshot.js';
import type {
    ExportProgressCallback,
    ExportRequest,
    ExportResult
} from './types.js';
import { writeHtmlExport } from './write-html-export.js';

/** Build a snapshot and write the multi-file HTML export site. */
export async function exportHtml(
    store: SqliteIndexStore,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    onProgress?.({
        phase: 'snapshot',
        message: 'Building export snapshot…',
    });
    const snapshot = await buildExportSnapshot(store, request, onProgress);
    return writeHtmlExport(snapshot, request, onProgress);
}

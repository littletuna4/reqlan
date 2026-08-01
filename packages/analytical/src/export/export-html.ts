import type { SqliteIndexStore } from '../index-store/sqlite-store.js';
import { buildExportSnapshot } from './build-export-snapshot.js';
import type { ExportRequest, ExportResult } from './types.js';
import { writeHtmlExport } from './write-html-export.js';

/** Build a snapshot and write the multi-file HTML export site. */
export async function exportHtml(
    store: SqliteIndexStore,
    request: ExportRequest
): Promise<ExportResult> {
    const snapshot = await buildExportSnapshot(store, request);
    return writeHtmlExport(snapshot, request);
}

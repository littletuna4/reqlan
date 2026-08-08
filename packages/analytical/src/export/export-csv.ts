import type { SqliteIndexStore } from '../index-store/sqlite-store.js';
import { buildExportSnapshot } from './build-export-snapshot.js';
import type {
    ExportProgressCallback,
    ExportRequest,
    ExportResult
} from './types.js';
import { dataExportSnapshotRequest } from './export-json.js';
import { writeCsvExport } from './write-csv-export.js';

/** Build a snapshot and write CSV files (ideas + references). */
export async function exportCsv(
    store: SqliteIndexStore,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    onProgress?.({
        phase: 'snapshot',
        message: 'Building export snapshot…',
    });
    const snapshot = await buildExportSnapshot(store, dataExportSnapshotRequest(request, 'csv'), onProgress);
    return writeCsvExport(snapshot, request, onProgress);
}

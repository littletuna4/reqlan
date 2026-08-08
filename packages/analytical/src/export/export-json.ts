import type { SqliteIndexStore } from '../index-store/sqlite-store.js';
import { buildExportSnapshot } from './build-export-snapshot.js';
import type {
    ExportProgressCallback,
    ExportRequest,
    ExportResult
} from './types.js';
import { writeJsonExport } from './write-json-export.js';

/** Lean request overrides shared by JSON/CSV (and similar data) exports. */
export function dataExportSnapshotRequest(request: ExportRequest, format: 'json' | 'csv'): ExportRequest {
    return {
        ...request,
        format,
        includeGraphPage: false,
        includeRequirementsPage: false,
        includePrintPages: false,
        includeIdeaPages: false,
        includeFilePages: false,
        includeCodeFilePages: false,
        includeClusterPages: true,
        includeAttributePages: true,
        runtimeMode: request.runtimeMode ?? 'document',
    };
}

/** Build a snapshot and write structured JSON. */
export async function exportJson(
    store: SqliteIndexStore,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    onProgress?.({
        phase: 'snapshot',
        message: 'Building export snapshot…',
    });
    const snapshot = await buildExportSnapshot(store, dataExportSnapshotRequest(request, 'json'), onProgress);
    return writeJsonExport(snapshot, request, onProgress);
}

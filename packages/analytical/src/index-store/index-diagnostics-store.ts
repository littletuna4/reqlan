/**
 * Per-base indexing timing diagnostic store (`index-diagnostics.sqlite`).
 * Sibling of ideas-index; survives Clear & rebuild.
 * Backed by rusqlite via the core native engine (NativeSqlDb).
 *
 * rq:["../../../../reqlan rq/extension/module/index.rq".index_diagnostics_store]
 * rq:["../../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_metrics]
 * rq:["../../../../reqlan rq/indexer/indexer.rq".index_diagnostics_timing]
 */
import { unlink } from 'node:fs/promises';
import { NativeSqlConnection } from '../native/native-sql-db.js';

export type IndexTimingTrigger = 'soft_sync' | 'rebuild' | 'enqueue' | 'stale';

export type IndexFileOutcome =
    | 'mtime_skip'
    | 'mtime_refresh'
    | 'hash_skip'
    | 'persisted'
    | 'error';

export interface IndexFileTimingRecord {
    fileUri: string;
    durationMs: number;
    outcome: IndexFileOutcome;
    pathDepth: number;
}

export interface IndexSyncRunRecord {
    trigger: IndexTimingTrigger;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    totalFiles: number;
    skippedMtime: number;
    indexedFiles: number;
    errorFiles: number;
    cancelled: boolean;
    sumFileDurationMs: number;
    avgPathDepth: number | undefined;
    files: IndexFileTimingRecord[];
}

export interface IndexSyncRunSummary {
    id: number;
    trigger: IndexTimingTrigger;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    totalFiles: number;
    skippedMtime: number;
    indexedFiles: number;
    errorFiles: number;
    cancelled: boolean;
    sumFileDurationMs: number;
    avgPathDepth: number | undefined;
}

export interface IndexFileTimingRow {
    id: number;
    runId: number;
    fileUri: string;
    durationMs: number;
    outcome: IndexFileOutcome;
    pathDepth: number;
}

export interface IndexDiagnosticsOverview {
    runCount: number;
    latestRun: IndexSyncRunSummary | undefined;
    /** Sum of wall durations across retained runs. */
    totalDurationMs: number;
    /** Sum of per-file durations across retained runs. */
    totalFileDurationMs: number;
    averageRunDurationMs: number;
    averagePathDepth: number | undefined;
}

const SCHEMA_VERSION = 1;
const MAX_RETAINED_RUNS = 50;

const BASE_SQL = [
    `CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        trigger TEXT NOT NULL,
        total_files INTEGER NOT NULL,
        skipped_mtime INTEGER NOT NULL,
        indexed_files INTEGER NOT NULL,
        error_files INTEGER NOT NULL,
        cancelled INTEGER NOT NULL DEFAULT 0,
        sum_file_duration_ms REAL NOT NULL DEFAULT 0,
        avg_path_depth REAL
    )`,
    `CREATE TABLE IF NOT EXISTS file_timings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        file_uri TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        outcome TEXT NOT NULL,
        path_depth INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_file_timings_run ON file_timings(run_id)`,
    `CREATE INDEX IF NOT EXISTS idx_file_timings_duration ON file_timings(duration_ms DESC)`
];

interface SqliteDatabase {
    conn: NativeSqlConnection;
}

/** Path segment count under the base (e.g. `a/b/c.rq` → 3). */
export function pathDepthFromUri(fileUri: string): number {
    const normalized = fileUri.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
    if (!normalized) {
        return 0;
    }
    return normalized.split('/').filter(Boolean).length;
}

export class IndexDiagnosticsStore {
    private readonly db: SqliteDatabase;

    private constructor(db: SqliteDatabase) {
        this.db = db;
    }

    static async open(dbPath: string): Promise<IndexDiagnosticsStore> {
        const conn = await NativeSqlConnection.open(dbPath);
        return IndexDiagnosticsStore.fromConnection(conn);
    }

    /** Wrap an already-open native connection (e.g. NativeWorkspaceIndex diagnostics DB). */
    static async fromConnection(conn: NativeSqlConnection): Promise<IndexDiagnosticsStore> {
        const store = new IndexDiagnosticsStore({ conn });
        await store.migrate();
        return store;
    }

    async close(): Promise<void> {
        this.db.conn.close();
    }

    static async deleteDatabaseFile(dbPath: string): Promise<void> {
        for (const suffix of ['', '-wal', '-shm']) {
            try {
                await unlink(`${dbPath}${suffix}`);
            } catch (error) {
                if (
                    typeof error === 'object' &&
                    error !== null &&
                    'code' in error &&
                    error.code === 'ENOENT'
                ) {
                    continue;
                }
                throw error;
            }
        }
    }

    async recordSyncRun(run: IndexSyncRunRecord): Promise<number> {
        try {
            this.db.conn.run('BEGIN');
            this.db.conn.run(
                `INSERT INTO sync_runs (
                    started_at, finished_at, duration_ms, trigger,
                    total_files, skipped_mtime, indexed_files, error_files,
                    cancelled, sum_file_duration_ms, avg_path_depth
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                run.startedAt,
                run.finishedAt,
                run.durationMs,
                run.trigger,
                run.totalFiles,
                run.skippedMtime,
                run.indexedFiles,
                run.errorFiles,
                run.cancelled ? 1 : 0,
                run.sumFileDurationMs,
                run.avgPathDepth ?? null
            );
            const runId = this.db.conn.lastInsertRowid();
            for (const file of run.files) {
                this.db.conn.run(
                    `INSERT INTO file_timings (run_id, file_uri, duration_ms, outcome, path_depth)
                     VALUES (?, ?, ?, ?, ?)`,
                    runId,
                    file.fileUri,
                    file.durationMs,
                    file.outcome,
                    file.pathDepth
                );
            }
            this.db.conn.run('COMMIT');
            await this.trimOldRuns();
            return runId;
        } catch (error) {
            try {
                this.db.conn.run('ROLLBACK');
            } catch {
                // ignore
            }
            throw error;
        }
    }

    async listRecentRuns(limit = 20): Promise<IndexSyncRunSummary[]> {
        const rows = this.db.conn.all<SyncRunSqlRow>(
            `SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?`,
            Math.max(1, Math.min(limit, MAX_RETAINED_RUNS))
        );
        return rows.map(mapRunSummary);
    }

    async getRun(runId: number): Promise<IndexSyncRunSummary | undefined> {
        const row = this.db.conn.get<SyncRunSqlRow>(`SELECT * FROM sync_runs WHERE id = ?`, runId);
        return row ? mapRunSummary(row) : undefined;
    }

    async listFileTimings(
        runId: number,
        options?: { limit?: number; order?: 'duration_desc' | 'duration_asc' | 'path' }
    ): Promise<IndexFileTimingRow[]> {
        const order = options?.order ?? 'duration_desc';
        const orderSql =
            order === 'duration_asc'
                ? 'duration_ms ASC, file_uri ASC'
                : order === 'path'
                    ? 'file_uri ASC'
                    : 'duration_ms DESC, file_uri ASC';
        const limit = Math.max(1, Math.min(options?.limit ?? 500, 2000));
        const rows = this.db.conn.all<FileTimingSqlRow>(
            `SELECT * FROM file_timings WHERE run_id = ? ORDER BY ${orderSql} LIMIT ?`,
            runId,
            limit
        );
        return rows.map(mapFileTiming);
    }

    async getOverview(): Promise<IndexDiagnosticsOverview> {
        const agg = this.db.conn.get<{
            run_count: number;
            total_duration: number | null;
            total_file_duration: number | null;
            avg_depth: number | null;
        }>(
            `SELECT
                COUNT(*) AS run_count,
                COALESCE(SUM(duration_ms), 0) AS total_duration,
                COALESCE(SUM(sum_file_duration_ms), 0) AS total_file_duration,
                AVG(avg_path_depth) AS avg_depth
             FROM sync_runs`
        );
        const runs = await this.listRecentRuns(1);
        const runCount = agg?.run_count ?? 0;
        const totalDurationMs = agg?.total_duration ?? 0;
        return {
            runCount,
            latestRun: runs[0],
            totalDurationMs,
            totalFileDurationMs: agg?.total_file_duration ?? 0,
            averageRunDurationMs: runCount > 0 ? totalDurationMs / runCount : 0,
            averagePathDepth: agg?.avg_depth == null ? undefined : agg.avg_depth
        };
    }

    private async migrate(): Promise<void> {
        for (const sql of BASE_SQL) {
            this.db.conn.exec(sql);
        }
        this.db.conn.run(
            `INSERT INTO meta (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            'schema_version',
            String(SCHEMA_VERSION)
        );
    }

    private async trimOldRuns(): Promise<void> {
        const cutoff = this.db.conn.get<{ id: number }>(
            `SELECT id FROM sync_runs ORDER BY id DESC LIMIT 1 OFFSET ?`,
            MAX_RETAINED_RUNS - 1
        );
        if (!cutoff) {
            return;
        }
        this.db.conn.run(`DELETE FROM file_timings WHERE run_id < ?`, cutoff.id);
        this.db.conn.run(`DELETE FROM sync_runs WHERE id < ?`, cutoff.id);
    }
}

type SyncRunSqlRow = {
    id: number;
    started_at: string;
    finished_at: string;
    duration_ms: number;
    trigger: string;
    total_files: number;
    skipped_mtime: number;
    indexed_files: number;
    error_files: number;
    cancelled: number;
    sum_file_duration_ms: number;
    avg_path_depth: number | null;
};

type FileTimingSqlRow = {
    id: number;
    run_id: number;
    file_uri: string;
    duration_ms: number;
    outcome: string;
    path_depth: number;
};

function mapRunSummary(row: SyncRunSqlRow): IndexSyncRunSummary {
    return {
        id: row.id,
        trigger: row.trigger as IndexTimingTrigger,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: row.duration_ms,
        totalFiles: row.total_files,
        skippedMtime: row.skipped_mtime,
        indexedFiles: row.indexed_files,
        errorFiles: row.error_files,
        cancelled: row.cancelled !== 0,
        sumFileDurationMs: row.sum_file_duration_ms,
        avgPathDepth: row.avg_path_depth == null ? undefined : row.avg_path_depth
    };
}

function mapFileTiming(row: FileTimingSqlRow): IndexFileTimingRow {
    return {
        id: row.id,
        runId: row.run_id,
        fileUri: row.file_uri,
        durationMs: row.duration_ms,
        outcome: row.outcome as IndexFileOutcome,
        pathDepth: row.path_depth
    };
}

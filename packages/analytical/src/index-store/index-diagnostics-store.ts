/**
 * Per-base indexing timing diagnostic store (`index-diagnostics.sqlite`).
 * Sibling of ideas-index; survives Clear & rebuild.
 *
 * rq:["../../../reqlan rq/extension/module/index.rq".index_diagnostics_store]
 * rq:["../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_metrics]
 * rq:["../../../reqlan rq/indexer/indexer.rq".index_diagnostics_timing]
 */
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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

interface SqlJsStatement {
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
}

interface SqlJsDatabaseHandle {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): unknown;
    prepare(sql: string, params?: unknown[]): SqlJsStatement;
    export(): Uint8Array;
    close(): void;
}

interface SqlJsModule {
    Database: new(data?: Uint8Array | ArrayLike<number>) => SqlJsDatabaseHandle;
}

interface SqliteDatabase {
    db: SqlJsDatabaseHandle;
    dbPath: string;
    dirty: boolean;
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
        const db = await openDatabase(dbPath);
        const store = new IndexDiagnosticsStore(db);
        await store.migrate();
        return store;
    }

    async close(): Promise<void> {
        await persistDatabase(this.db);
        this.db.db.close();
    }

    async recordSyncRun(run: IndexSyncRunRecord): Promise<number> {
        try {
            this.db.db.run('BEGIN');
            this.db.db.run(
                `INSERT INTO sync_runs (
                    started_at, finished_at, duration_ms, trigger,
                    total_files, skipped_mtime, indexed_files, error_files,
                    cancelled, sum_file_duration_ms, avg_path_depth
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
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
                ]
            );
            const idRow = await get<{ id: number }>(this.db, 'SELECT last_insert_rowid() AS id');
            const runId = idRow?.id ?? 0;
            for (const file of run.files) {
                this.db.db.run(
                    `INSERT INTO file_timings (run_id, file_uri, duration_ms, outcome, path_depth)
                     VALUES (?, ?, ?, ?, ?)`,
                    [runId, file.fileUri, file.durationMs, file.outcome, file.pathDepth]
                );
            }
            this.db.db.run('COMMIT');
            this.db.dirty = true;
            await this.trimOldRuns();
            await persistDatabase(this.db);
            return runId;
        } catch (error) {
            try {
                this.db.db.run('ROLLBACK');
            } catch {
                // ignore
            }
            throw error;
        }
    }

    async listRecentRuns(limit = 20): Promise<IndexSyncRunSummary[]> {
        const rows = await all<SyncRunSqlRow>(
            this.db,
            `SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?`,
            Math.max(1, Math.min(limit, MAX_RETAINED_RUNS))
        );
        return rows.map(mapRunSummary);
    }

    async getRun(runId: number): Promise<IndexSyncRunSummary | undefined> {
        const row = await get<SyncRunSqlRow>(this.db, `SELECT * FROM sync_runs WHERE id = ?`, runId);
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
        const rows = await all<FileTimingSqlRow>(
            this.db,
            `SELECT * FROM file_timings WHERE run_id = ? ORDER BY ${orderSql} LIMIT ?`,
            runId,
            limit
        );
        return rows.map(mapFileTiming);
    }

    async getOverview(): Promise<IndexDiagnosticsOverview> {
        const agg = await get<{
            run_count: number;
            total_duration: number | null;
            total_file_duration: number | null;
            avg_depth: number | null;
        }>(
            this.db,
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
            this.db.db.run(sql);
        }
        this.db.db.run(
            `INSERT INTO meta (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            ['schema_version', String(SCHEMA_VERSION)]
        );
        this.db.dirty = true;
        await persistDatabase(this.db);
    }

    private async trimOldRuns(): Promise<void> {
        const cutoff = await get<{ id: number }>(
            this.db,
            `SELECT id FROM sync_runs ORDER BY id DESC LIMIT 1 OFFSET ?`,
            MAX_RETAINED_RUNS - 1
        );
        if (!cutoff) {
            return;
        }
        this.db.db.run(`DELETE FROM file_timings WHERE run_id < ?`, [cutoff.id]);
        this.db.db.run(`DELETE FROM sync_runs WHERE id < ?`, [cutoff.id]);
        this.db.dirty = true;
    }
}

interface SyncRunSqlRow {
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
}

interface FileTimingSqlRow {
    id: number;
    run_id: number;
    file_uri: string;
    duration_ms: number;
    outcome: string;
    path_depth: number;
}

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

let sqlJsModulePromise: Promise<SqlJsModule> | undefined;

async function getSqlJsModule(): Promise<SqlJsModule> {
    sqlJsModulePromise ??= initSqlJs({}) as Promise<SqlJsModule>;
    return sqlJsModulePromise;
}

async function openDatabase(path: string): Promise<SqliteDatabase> {
    await mkdir(dirname(path), { recursive: true });
    const SQL = await getSqlJsModule();
    let bytes: Uint8Array | undefined;
    try {
        bytes = new Uint8Array(await readFile(path));
    } catch {
        bytes = undefined;
    }
    return {
        db: bytes ? new SQL.Database(bytes) : new SQL.Database(),
        dbPath: path,
        dirty: false
    };
}

async function persistDatabase(db: SqliteDatabase): Promise<void> {
    if (!db.dirty) {
        return;
    }
    await mkdir(dirname(db.dbPath), { recursive: true });
    await writeFile(db.dbPath, Buffer.from(db.db.export()));
    db.dirty = false;
}

async function get<T>(db: SqliteDatabase, sql: string, ...params: unknown[]): Promise<T | undefined> {
    const rows = await all<T>(db, sql, ...params);
    return rows[0];
}

async function all<T>(db: SqliteDatabase, sql: string, ...params: unknown[]): Promise<T[]> {
    const statement = db.db.prepare(sql, params);
    const rows: T[] = [];
    try {
        while (statement.step()) {
            rows.push(statement.getAsObject() as T);
        }
        return rows;
    } finally {
        statement.free();
    }
}

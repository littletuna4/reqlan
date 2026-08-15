/**
 * Thin TS wrapper around napi SQL surfaces (NativeSqlDb or NativeWorkspaceIndex).
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 */
import { mkdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadNativeEngine } from './load-native.js';
import type { NativeWorkspaceIndex } from './native-workspace-index.js';

export interface NativeSqlDbHandle {
    query(sql: string, params?: unknown[]): Record<string, unknown>[];
    execute(sql: string, params?: unknown[]): number;
    executeBatch(sql: string): void;
    lastInsertRowid(): number;
    close(): void;
}

interface NativeSqlDbCtor {
    open(path: string): NativeSqlDbHandle;
}

function toJsonParams(params: unknown[]): unknown[] {
    return params.map(value => (value === undefined ? null : value));
}

export class NativeSqlConnection {
    private constructor(
        private readonly handle: NativeSqlDbHandle,
        readonly dbPath: string,
        private readonly ownsHandle: boolean
    ) {}

    static async open(dbPath: string): Promise<NativeSqlConnection> {
        await mkdir(dirname(dbPath), { recursive: true });
        const engine = loadNativeEngine() as { NativeSqlDb: NativeSqlDbCtor };
        if (!engine.NativeSqlDb) {
            throw new Error('NativeSqlDb is missing from the native engine; rebuild reqlan-napi.');
        }
        const conn = new NativeSqlConnection(engine.NativeSqlDb.open(dbPath), dbPath, true);
        conn.assertHealthy();
        return conn;
    }

    /** Share the ideas DB connection owned by a NativeWorkspaceIndex (single writer). */
    static fromWorkspaceIdeas(native: NativeWorkspaceIndex, dbPath: string): NativeSqlConnection {
        return new NativeSqlConnection(native.ideasSqlHandle(), dbPath, false);
    }

    /** Share the diagnostics DB connection owned by a NativeWorkspaceIndex. */
    static fromWorkspaceDiagnostics(
        native: NativeWorkspaceIndex,
        dbPath: string
    ): NativeSqlConnection {
        return new NativeSqlConnection(native.diagnosticsSqlHandle(), dbPath, false);
    }

    run(sql: string, ...params: unknown[]): void {
        this.handle.execute(sql, toJsonParams(params));
    }

    exec(sql: string): void {
        this.handle.executeBatch(sql);
    }

    all<T extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        ...params: unknown[]
    ): T[] {
        return this.handle.query(sql, toJsonParams(params)) as T[];
    }

    get<T extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        ...params: unknown[]
    ): T | undefined {
        return this.all<T>(sql, ...params)[0];
    }

    lastInsertRowid(): number {
        return this.handle.lastInsertRowid();
    }

    assertHealthy(): void {
        const rows = this.all<Record<string, unknown>>('PRAGMA integrity_check');
        if (rows.length === 0) {
            throw new Error('database disk image is malformed: integrity_check returned no rows');
        }
        for (const row of rows) {
            const result = String(
                row.integrity_check ?? row.quick_check ?? Object.values(row)[0] ?? ''
            );
            if (result && result.toLowerCase() !== 'ok') {
                throw new Error(`database disk image is malformed: ${result}`);
            }
        }
        const pageCountRow = this.get<Record<string, unknown>>('PRAGMA page_count');
        const pageSizeRow = this.get<Record<string, unknown>>('PRAGMA page_size');
        const pageCount = Number(pageCountRow?.page_count ?? Object.values(pageCountRow ?? {})[0] ?? 0);
        const pageSize = Number(pageSizeRow?.page_size ?? Object.values(pageSizeRow ?? {})[0] ?? 0);
        if (pageCount > 0 && pageSize > 0) {
            try {
                const size = statSync(this.dbPath).size;
                if (size < pageCount * pageSize) {
                    throw new Error(
                        `database disk image is malformed: file truncated (${size} bytes, expected ${pageCount * pageSize})`
                    );
                }
            } catch (error) {
                if (error instanceof Error && /malformed/i.test(error.message)) {
                    throw error;
                }
            }
        }
    }

    close(): void {
        if (this.ownsHandle) {
            this.handle.close();
        }
    }
}

/**
 * Drop-in workspace sync facade over napi NativeWorkspaceIndex.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
 */
import { loadNativeEngine } from './load-native.js';
import type { NativeSqlDbHandle } from './native-sql-db.js';

export interface NativeIndexFileResult {
    fileUri: string;
    diagnostics: string[];
}

export interface NativeSyncResult {
    processed: number;
    total: number;
    currentFile?: string | null;
    skippedMtime: number;
    indexed: number;
    errors: number;
    cancelled: boolean;
    fileIssues: Array<{ fileUri: string; message: string }>;
}

export interface NativeFuzzySearchHit {
    id: string;
    name: string;
    kind: string;
    fileUri: string;
    summary: string;
    lineStart: number;
    score: number;
}

export interface NativeFuzzySearchResult {
    hits: NativeFuzzySearchHit[];
    total: number;
    truncated: boolean;
}

export interface NativeWorkspaceIndexHandle {
    ensureReady(): NativeSyncResult;
    syncWorkspace(hardRebuild: boolean): NativeSyncResult;
    cancelSync(): void;
    indexFile(filePathOrUri: string): NativeIndexFileResult;
    deleteDocument(fileUri: string): void;
    shutdown?: () => void;
    clearIdeas(): void;
    ideaCounts(): { ideas: number; edges: number };
    fuzzySearch(
        query: string,
        limit?: number,
        requireQuery?: boolean,
        offset?: number
    ): NativeFuzzySearchResult;
    ideasQuery(sql: string, params?: unknown[]): Record<string, unknown>[];
    ideasExecute(sql: string, params?: unknown[]): number;
    ideasExecuteBatch(sql: string): void;
    ideasLastInsertRowid(): number;
    diagnosticsQuery(sql: string, params?: unknown[]): Record<string, unknown>[];
    diagnosticsExecute(sql: string, params?: unknown[]): number;
    diagnosticsExecuteBatch(sql: string): void;
    diagnosticsLastInsertRowid(): number;
}

interface NativeWorkspaceIndexCtor {
    open(workspaceRoot: string, storagePath?: string): NativeWorkspaceIndexHandle;
}

export class NativeWorkspaceIndex {
    private constructor(private readonly handle: NativeWorkspaceIndexHandle) {}

    static open(workspaceRoot: string, storagePath?: string): NativeWorkspaceIndex {
        const engine = loadNativeEngine() as { NativeWorkspaceIndex: NativeWorkspaceIndexCtor };
        if (!engine.NativeWorkspaceIndex) {
            throw new Error(
                'NativeWorkspaceIndex is missing from the native engine; rebuild reqlan-napi.'
            );
        }
        return new NativeWorkspaceIndex(engine.NativeWorkspaceIndex.open(workspaceRoot, storagePath));
    }

    ensureReady(): NativeSyncResult {
        return this.handle.ensureReady();
    }

    syncWorkspace(hardRebuild = false): NativeSyncResult {
        return this.handle.syncWorkspace(hardRebuild);
    }

    cancelSync(): void {
        this.handle.cancelSync();
    }

    indexFile(filePathOrUri: string): NativeIndexFileResult {
        const result = this.handle.indexFile(filePathOrUri);
        return {
            fileUri: result.fileUri,
            diagnostics: result.diagnostics ?? []
        };
    }

    close(): void {
        const shutdown = this.handle.shutdown;
        if (typeof shutdown === 'function') {
            shutdown.call(this.handle);
        }
    }

    deleteDocument(fileUri: string): void {
        this.handle.deleteDocument(fileUri);
    }

    clearIdeas(): void {
        this.handle.clearIdeas();
    }

    ideaCounts(): { ideas: number; edges: number } {
        return this.handle.ideaCounts();
    }

    fuzzySearch(
        query: string,
        limit?: number,
        requireQuery = false,
        offset?: number
    ): NativeFuzzySearchResult {
        return this.handle.fuzzySearch(query, limit, requireQuery, offset);
    }

    /** Shared ideas-DB SQL surface; NativeWorkspaceIndex owns the connection. */
    ideasSqlHandle(): NativeSqlDbHandle {
        const { handle } = this;
        return {
            query: (sql, params) => handle.ideasQuery(sql, params),
            execute: (sql, params) => handle.ideasExecute(sql, params),
            executeBatch: sql => handle.ideasExecuteBatch(sql),
            lastInsertRowid: () => handle.ideasLastInsertRowid(),
            close() {
                // Connection lifetime is owned by NativeWorkspaceIndex.
            }
        };
    }

    /** Shared diagnostics-DB SQL surface; NativeWorkspaceIndex owns the connection. */
    diagnosticsSqlHandle(): NativeSqlDbHandle {
        const { handle } = this;
        return {
            query: (sql, params) => handle.diagnosticsQuery(sql, params),
            execute: (sql, params) => handle.diagnosticsExecute(sql, params),
            executeBatch: sql => handle.diagnosticsExecuteBatch(sql),
            lastInsertRowid: () => handle.diagnosticsLastInsertRowid(),
            close() {
                // Connection lifetime is owned by NativeWorkspaceIndex.
            }
        };
    }
}

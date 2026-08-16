/**
 * Thin TS wrapper around napi SQL surfaces (NativeSqlDb or NativeWorkspaceIndex).
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 */
import { mkdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadNativeEngine } from './load-native.js';
import type { NativeWorkspaceIndex } from './native-workspace-index.js';

/**
 * Typed webview table/graph query surface implemented natively (reqlan-index queries.rs).
 * Returns raw SQL rows; TS presentation mappers shape them into view rows.
 */
/** Outbound + inbound raw reference rows for a single idea (both joined to ideas). */
export interface NativeReferenceBundle {
    outbound: Record<string, unknown>[];
    inbound: Record<string, unknown>[];
}

export interface NativeQuerySurface {
    countIdeas(query: unknown): number;
    listIdeasPageRows(query: unknown): Record<string, unknown>[];
    listReferenceChipRows(ideaIds: string[]): Record<string, unknown>[];
    countIdeasets(query: unknown): number;
    listIdeasetsPageRows(query: unknown): Record<string, unknown>[];
    listIdeasetMemberRows(
        ideasetId: string,
        kind: string,
        fileUri: string
    ): Record<string, unknown>[];
    countReferences(query: unknown): number;
    listReferencesPageRows(query: unknown): Record<string, unknown>[];
    listTodoIdeaRows(): Record<string, unknown>[];
    listIdeasForGraphQuery(
        query: unknown,
        limit: number
    ): { rows: Record<string, unknown>[]; totalMatching: number };
    listRecentGitIdeaRows(limit: number): Record<string, unknown>[];
    listIdeaIdsMissingGitDates(limit: number, fileUri?: string, preferFileUri?: string): string[];
    listAttributeIdeaRows(): Record<string, unknown>[];

    // ---- typed domain read/write surface (reqlan-index queries.rs) --------------
    migrateIdeasSchema(): void;
    getDocumentHash(fileUri: string): string | null;
    getDocumentMtimeMs(fileUri: string): number | null;
    listDocumentMtimeRows(): Record<string, unknown>[];
    listDocumentUris(): string[];
    listAllIdeaRows(): Record<string, unknown>[];
    getIdeaRow(id: string): Record<string, unknown> | null;
    getIdeasInFileRows(fileUri: string): Record<string, unknown>[];
    getIdeaAtLineRow(fileUri: string, line: number): Record<string, unknown> | null;
    getIdeasetAtLineRow(fileUri: string, line: number): Record<string, unknown> | null;
    listIdeasInFileWithRangeRows(fileUri: string): Record<string, unknown>[];
    listIdeasetsInFileWithRangeRows(fileUri: string): Record<string, unknown>[];
    getIdeasByIdsRows(ids: string[]): Record<string, unknown>[];
    searchIdeaRows(search: string): Record<string, unknown>[];
    listReferencesForIdea(ideaId: string): NativeReferenceBundle;
    countUnresolvedForIdea(ideaId: string): number;
    countEdgesFromFile(fileUri: string): number;
    getEdgesFromRows(sourceId: string): Record<string, unknown>[];
    getEdgesToRows(targetId: string): Record<string, unknown>[];
    getEdgesForNodesRows(nodeIds: string[]): Record<string, unknown>[];
    getEdgesReferencingFileRows(filePath: string): Record<string, unknown>[];
    getAllEdgeRows(): Record<string, unknown>[];
    listFileReferenceTargetRows(): Record<string, unknown>[];
    allIdeaRawRows(): Record<string, unknown>[];
    counts(): { ideas: number; edges: number };
    updateDocumentMtime(fileUri: string, mtimeMs: number): void;
    updateGitDates(
        id: string,
        createdAt?: string,
        modifiedAt?: string,
        changeCount?: number
    ): void;
    clearAll(): void;
    removeDocuments(fileUris: string[]): void;
    upsertDocument(
        fileUri: string,
        contentHash: string,
        ideas: unknown,
        edges: unknown,
        mtimeMs?: number
    ): void;
}

export interface NativeSqlDbHandle extends NativeQuerySurface {
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

    // ---- typed webview table/graph query surface (native SQL builders) ----------

    countIdeas(query: unknown): number {
        return this.handle.countIdeas(query);
    }

    listIdeasPageRows(query: unknown): Record<string, unknown>[] {
        return this.handle.listIdeasPageRows(query);
    }

    listReferenceChipRows(ideaIds: string[]): Record<string, unknown>[] {
        return this.handle.listReferenceChipRows(ideaIds);
    }

    countIdeasets(query: unknown): number {
        return this.handle.countIdeasets(query);
    }

    listIdeasetsPageRows(query: unknown): Record<string, unknown>[] {
        return this.handle.listIdeasetsPageRows(query);
    }

    listIdeasetMemberRows(
        ideasetId: string,
        kind: string,
        fileUri: string
    ): Record<string, unknown>[] {
        return this.handle.listIdeasetMemberRows(ideasetId, kind, fileUri);
    }

    countReferences(query: unknown): number {
        return this.handle.countReferences(query);
    }

    listReferencesPageRows(query: unknown): Record<string, unknown>[] {
        return this.handle.listReferencesPageRows(query);
    }

    listTodoIdeaRows(): Record<string, unknown>[] {
        return this.handle.listTodoIdeaRows();
    }

    listIdeasForGraphQuery(
        query: unknown,
        limit: number
    ): { rows: Record<string, unknown>[]; totalMatching: number } {
        return this.handle.listIdeasForGraphQuery(query, limit);
    }

    listRecentGitIdeaRows(limit: number): Record<string, unknown>[] {
        return this.handle.listRecentGitIdeaRows(limit);
    }

    listIdeaIdsMissingGitDates(limit: number, fileUri?: string, preferFileUri?: string): string[] {
        return this.handle.listIdeaIdsMissingGitDates(limit, fileUri, preferFileUri);
    }

    listAttributeIdeaRows(): Record<string, unknown>[] {
        return this.handle.listAttributeIdeaRows();
    }

    // ---- typed domain read/write surface (native SQL) ---------------------------

    migrateIdeasSchema(): void {
        this.handle.migrateIdeasSchema();
    }

    getDocumentHash(fileUri: string): string | null {
        return this.handle.getDocumentHash(fileUri);
    }

    getDocumentMtimeMs(fileUri: string): number | null {
        return this.handle.getDocumentMtimeMs(fileUri);
    }

    listDocumentMtimeRows(): Record<string, unknown>[] {
        return this.handle.listDocumentMtimeRows();
    }

    listDocumentUris(): string[] {
        return this.handle.listDocumentUris();
    }

    listAllIdeaRows(): Record<string, unknown>[] {
        return this.handle.listAllIdeaRows();
    }

    getIdeaRow(id: string): Record<string, unknown> | null {
        return this.handle.getIdeaRow(id);
    }

    getIdeasInFileRows(fileUri: string): Record<string, unknown>[] {
        return this.handle.getIdeasInFileRows(fileUri);
    }

    getIdeaAtLineRow(fileUri: string, line: number): Record<string, unknown> | null {
        return this.handle.getIdeaAtLineRow(fileUri, line);
    }

    getIdeasetAtLineRow(fileUri: string, line: number): Record<string, unknown> | null {
        return this.handle.getIdeasetAtLineRow(fileUri, line);
    }

    listIdeasInFileWithRangeRows(fileUri: string): Record<string, unknown>[] {
        return this.handle.listIdeasInFileWithRangeRows(fileUri);
    }

    listIdeasetsInFileWithRangeRows(fileUri: string): Record<string, unknown>[] {
        return this.handle.listIdeasetsInFileWithRangeRows(fileUri);
    }

    getIdeasByIdsRows(ids: string[]): Record<string, unknown>[] {
        return this.handle.getIdeasByIdsRows(ids);
    }

    searchIdeaRows(search: string): Record<string, unknown>[] {
        return this.handle.searchIdeaRows(search);
    }

    listReferencesForIdea(ideaId: string): NativeReferenceBundle {
        return this.handle.listReferencesForIdea(ideaId);
    }

    countUnresolvedForIdea(ideaId: string): number {
        return this.handle.countUnresolvedForIdea(ideaId);
    }

    countEdgesFromFile(fileUri: string): number {
        return this.handle.countEdgesFromFile(fileUri);
    }

    getEdgesFromRows(sourceId: string): Record<string, unknown>[] {
        return this.handle.getEdgesFromRows(sourceId);
    }

    getEdgesToRows(targetId: string): Record<string, unknown>[] {
        return this.handle.getEdgesToRows(targetId);
    }

    getEdgesForNodesRows(nodeIds: string[]): Record<string, unknown>[] {
        return this.handle.getEdgesForNodesRows(nodeIds);
    }

    getEdgesReferencingFileRows(filePath: string): Record<string, unknown>[] {
        return this.handle.getEdgesReferencingFileRows(filePath);
    }

    getAllEdgeRows(): Record<string, unknown>[] {
        return this.handle.getAllEdgeRows();
    }

    listFileReferenceTargetRows(): Record<string, unknown>[] {
        return this.handle.listFileReferenceTargetRows();
    }

    allIdeaRawRows(): Record<string, unknown>[] {
        return this.handle.allIdeaRawRows();
    }

    counts(): { ideas: number; edges: number } {
        return this.handle.counts();
    }

    updateDocumentMtime(fileUri: string, mtimeMs: number): void {
        this.handle.updateDocumentMtime(fileUri, mtimeMs);
    }

    updateGitDates(
        id: string,
        createdAt?: string,
        modifiedAt?: string,
        changeCount?: number
    ): void {
        this.handle.updateGitDates(id, createdAt, modifiedAt, changeCount);
    }

    clearAll(): void {
        this.handle.clearAll();
    }

    removeDocuments(fileUris: string[]): void {
        this.handle.removeDocuments(fileUris);
    }

    upsertDocument(
        fileUri: string,
        contentHash: string,
        ideas: unknown,
        edges: unknown,
        mtimeMs?: number
    ): void {
        this.handle.upsertDocument(fileUri, contentHash, ideas, edges, mtimeMs);
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

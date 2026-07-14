/**
 * SQLite-backed persistence for the workspace idea graph index.
 * Uses a bundled asm.js build so VSIX installs do not depend on native modules.
 */
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { BASE_MIGRATIONS, SCHEMA_VERSION, VERSION_MIGRATIONS } from './schema.js';
import type {
    EdgeKind,
    EdgeRecord,
    IdeaRecord,
    IdeaReferenceChip,
    IdeaSummary,
    IdeaWithRange,
    IdeasetKind,
    IdeasetMemberRow,
    IdeasetTableRow,
    IdeaTableRow,
    ReferenceListRow,
    ReferenceTableRow,
    ReferenceViewType,
    AncestorChainResult
} from '../core/types.js';
import { BLOCKING_STATUSES, ideaStatus, ideaTags, parseAttributes } from '../core/types.js';
import type {
    IdeasTableQuery,
    IdeasetsTableQuery,
    ReferencesTableQuery
} from './webview-table-queries.js';
import type { GraphViewQuery } from './webview-graph-queries.js';
import {
    attributeValuesForKeys,
    buildIdeasetsOrderClause,
    buildIdeasetsWhereClause,
    buildIdeasOrderClause,
    buildIdeasWhereClause,
    buildReferencesOrderClause,
    buildReferencesWhereClause
} from './webview-table-queries.js';
import { buildGraphFilterWhereClause } from './webview-graph-queries.js';

interface SqlJsStatement {
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
}

interface SqlJsDatabaseHandle {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string, params?: unknown[]): unknown;
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
    inTransaction: boolean;
    dirty: boolean;
}

export class SqliteIndexStore {
    private readonly db: SqliteDatabase;

    private constructor(db: SqliteDatabase) {
        this.db = db;
    }

    static async open(dbPath: string): Promise<SqliteIndexStore> {
        const db = await openDatabase(dbPath);
        await run(db, 'PRAGMA foreign_keys = ON');
        const store = new SqliteIndexStore(db);
        await store.migrate();
        return store;
    }

    async close(): Promise<void> {
        await closeDatabase(this.db);
    }

    async getDocumentHash(fileUri: string): Promise<string | undefined> {
        const row = await get<{ content_hash: string }>(
            this.db,
            'SELECT content_hash FROM documents WHERE file_uri = ?',
            fileUri
        );
        return row?.content_hash;
    }

    async upsertDocument(fileUri: string, contentHash: string, ideas: IdeaRecord[], edges: EdgeRecord[]): Promise<void> {
        await run(this.db, 'BEGIN');
        try {
            await run(
                this.db,
                'DELETE FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?)',
                fileUri
            );
            await run(this.db, 'DELETE FROM ideas WHERE file_uri = ?', fileUri);

            const insertIdeaSql = `
                INSERT INTO ideas (
                    id, name, kind, file_uri, line_start, line_end, summary,
                    attributes_json, content_hash, git_created_at, git_modified_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?
                )
            `;
            for (const idea of ideas) {
                await run(this.db, insertIdeaSql,
                    idea.id,
                    idea.name,
                    idea.kind,
                    idea.fileUri,
                    idea.lineStart,
                    idea.lineEnd,
                    idea.summary,
                    idea.attributesJson,
                    idea.contentHash,
                    idea.gitCreatedAt ?? null,
                    idea.gitModifiedAt ?? null
                );
            }

            const insertEdgeSql = `
                INSERT OR IGNORE INTO edges (
                    id, source_id, target_id, target_file, kind, label,
                    source_line, snippet, is_resolved
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            for (const edge of edges) {
                await run(this.db, insertEdgeSql,
                    edge.id,
                    edge.sourceId,
                    edge.targetId ?? null,
                    edge.targetFile ?? null,
                    edge.kind,
                    edge.label ?? null,
                    edge.sourceLine ?? null,
                    edge.snippet ?? null,
                    edge.isResolved === false ? 0 : 1
                );
            }

            await run(this.db, `
                INSERT INTO documents (file_uri, content_hash, indexed_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(file_uri) DO UPDATE SET
                    content_hash = excluded.content_hash,
                    indexed_at = excluded.indexed_at
            `, fileUri, contentHash);
            await run(this.db, 'COMMIT');
        } catch (error) {
            await run(this.db, 'ROLLBACK');
            throw error;
        }
    }

    async removeDocument(fileUri: string): Promise<void> {
        await run(this.db, 'BEGIN');
        try {
            await run(
                this.db,
                'DELETE FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?)',
                fileUri
            );
            await run(this.db, 'DELETE FROM ideas WHERE file_uri = ?', fileUri);
            await run(this.db, 'DELETE FROM documents WHERE file_uri = ?', fileUri);
            await run(this.db, 'COMMIT');
        } catch (error) {
            await run(this.db, 'ROLLBACK');
            throw error;
        }
    }

    async clearAll(): Promise<void> {
        await run(this.db, 'BEGIN');
        try {
            await run(this.db, 'DELETE FROM edges');
            await run(this.db, 'DELETE FROM ideas');
            await run(this.db, 'DELETE FROM documents');
            await run(this.db, 'COMMIT');
        } catch (error) {
            await run(this.db, 'ROLLBACK');
            throw error;
        }
    }

    async listAllIdeas(): Promise<IdeaSummary[]> {
        const rows = await all<SummaryRow>(this.db, `
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
            FROM ideas
            ORDER BY file_uri, line_start
        `);
        return rows.map(row => this.toSummary(row));
    }

    async getIdea(id: string): Promise<IdeaSummary | undefined> {
        const row = await get<SummaryRow>(this.db, `
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json,
                   git_created_at, git_modified_at
            FROM ideas WHERE id = ?
        `, id);
        return row ? this.toSummary(row) : undefined;
    }

    async getIdeasInFile(fileUri: string): Promise<IdeaSummary[]> {
        const rows = await all<SummaryRow>(this.db, `
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
            FROM ideas WHERE file_uri = ?
            ORDER BY line_start
        `, fileUri);
        return rows.map(row => this.toSummary(row));
    }

    async getIdeaAtLine(fileUri: string, line: number): Promise<IdeaSummary | undefined> {
        const row = await get<SummaryRow>(this.db, `
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json,
                   git_created_at, git_modified_at
            FROM ideas
            WHERE file_uri = ? AND line_start <= ? AND ? <= line_end AND kind != 'ideaset'
            ORDER BY line_start DESC
            LIMIT 1
        `, fileUri, line, line);
        return row ? this.toSummary(row) : undefined;
    }

    /** Innermost ideaset whose line range contains `line` (0-based). */
    async getIdeasetAtLine(fileUri: string, line: number): Promise<IdeaSummary | undefined> {
        const row = await get<SummaryRow>(this.db, `
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json,
                   git_created_at, git_modified_at
            FROM ideas
            WHERE file_uri = ? AND line_start <= ? AND ? <= line_end AND kind = 'ideaset'
            ORDER BY line_start DESC
            LIMIT 1
        `, fileUri, line, line);
        return row ? this.toSummary(row) : undefined;
    }

    async listIdeasInFileWithRanges(fileUri: string): Promise<IdeaWithRange[]> {
        const rows = await all<SummaryRowWithEnd>(this.db, `
            SELECT id, name, kind, file_uri, line_start, line_end, summary, attributes_json,
                   git_created_at, git_modified_at
            FROM ideas
            WHERE file_uri = ? AND kind != 'ideaset'
            ORDER BY line_start ASC
        `, fileUri);
        return rows.map(row => ({
            ...this.toSummary(row),
            lineEnd: row.line_end
        }));
    }

    async listIdeasetsInFileWithRanges(fileUri: string): Promise<IdeaWithRange[]> {
        const rows = await all<SummaryRowWithEnd>(this.db, `
            SELECT id, name, kind, file_uri, line_start, line_end, summary, attributes_json,
                   git_created_at, git_modified_at
            FROM ideas
            WHERE file_uri = ? AND kind = 'ideaset'
            ORDER BY line_start ASC
        `, fileUri);
        return rows.map(row => ({
            ...this.toSummary(row),
            lineEnd: row.line_end
        }));
    }

    async listReferencesForIdea(ideaId: string): Promise<ReferenceListRow[]> {
        const outbound = await all<ReferenceListSqlRow>(this.db, `
            SELECT
                e.id AS edge_id,
                e.kind,
                e.source_id,
                e.target_id,
                e.target_file,
                e.label,
                e.source_line,
                e.snippet,
                e.is_resolved,
                ti.name AS target_name,
                ti.file_uri AS target_uri,
                ti.line_start AS target_line
            FROM edges e
            LEFT JOIN ideas ti ON ti.id = e.target_id
            WHERE e.source_id = ?
            ORDER BY e.kind, e.id
        `, ideaId);

        const inbound = await all<ReferenceListSqlRow>(this.db, `
            SELECT
                e.id AS edge_id,
                e.kind,
                e.source_id,
                e.target_id,
                e.target_file,
                e.label,
                e.source_line,
                e.snippet,
                e.is_resolved,
                si.name AS source_name,
                si.file_uri AS source_uri,
                si.line_start AS source_line_idea
            FROM edges e
            JOIN ideas si ON si.id = e.source_id
            WHERE e.target_id = ?
            ORDER BY e.kind, e.id
        `, ideaId);

        const rows: ReferenceListRow[] = [];
        for (const row of outbound) {
            rows.push(toOutboundReferenceListRow(row));
        }
        for (const row of inbound) {
            rows.push(toInboundReferenceListRow(row));
        }
        return rows;
    }

    async listReferencesWithinHopDepth(ideaId: string, hopDepth: number): Promise<ReferenceListRow[]> {
        const depth = Math.max(1, Math.round(hopDepth));
        const edgeIds = new Set<string>();
        const rows: ReferenceListRow[] = [];
        const visited = new Set<string>();
        let frontier = [ideaId];

        for (let level = 0; level < depth && frontier.length > 0; level += 1) {
            const nextFrontier = new Set<string>();
            for (const id of frontier) {
                if (visited.has(id)) {
                    continue;
                }
                visited.add(id);
                for (const row of await this.listReferencesForIdea(id)) {
                    if (!edgeIds.has(row.edgeId)) {
                        edgeIds.add(row.edgeId);
                        rows.push(row);
                    }
                    const neighbor =
                        row.direction === 'inbound' ? row.sourceIdeaId : row.targetIdeaId;
                    if (neighbor && !visited.has(neighbor)) {
                        nextFrontier.add(neighbor);
                    }
                }
            }
            frontier = [...nextFrontier];
        }

        return rows;
    }

    async countUnresolvedForIdea(ideaId: string): Promise<number> {
        return (await get<{ count: number }>(this.db, `
            SELECT COUNT(*) AS count FROM edges
            WHERE source_id = ? AND is_resolved = 0
        `, ideaId))!.count;
    }

    async countEdgesFromFile(fileUri: string): Promise<number> {
        return (await get<{ count: number }>(this.db, `
            SELECT COUNT(*) AS count
            FROM edges
            WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?)
        `, fileUri))!.count;
    }

    async listAncestorChain(ideaId: string, maxDepth = 8): Promise<IdeaSummary[]> {
        const ancestors: IdeaSummary[] = [];
        const visited = new Set<string>([ideaId]);
        let frontier = [ideaId];

        for (let depth = 0; depth < maxDepth; depth++) {
            const nextFrontier: string[] = [];
            for (const currentId of frontier) {
                for (const edge of await this.getEdgesFrom(currentId)) {
                    if (edge.kind !== 'references' || !edge.targetId || visited.has(edge.targetId)) {
                        continue;
                    }
                    visited.add(edge.targetId);
                    const idea = await this.getIdea(edge.targetId);
                    if (idea) {
                        ancestors.push(idea);
                        nextFrontier.push(edge.targetId);
                    }
                }
            }
            if (nextFrontier.length === 0) {
                break;
            }
            frontier = nextFrontier;
        }

        return ancestors;
    }

    async buildAncestorChainResult(ideaId: string, maxDepth = 8): Promise<AncestorChainResult> {
        const ancestors = await this.listAncestorChain(ideaId, maxDepth);
        const statusRollup: Record<string, number> = {};
        const blocking: IdeaSummary[] = [];
        for (const ancestor of ancestors) {
            const status = (ancestor.status ?? 'unspecified').toLowerCase();
            statusRollup[status] = (statusRollup[status] ?? 0) + 1;
            if (BLOCKING_STATUSES.has(status)) {
                blocking.push(ancestor);
            }
        }
        return { ideaId, ancestors, statusRollup, blocking };
    }

    async getEdgesFrom(sourceId: string): Promise<EdgeRecord[]> {
        const rows = await all<SqliteEdgeRow>(this.db, 'SELECT * FROM edges WHERE source_id = ?', sourceId);
        return rows.map(mapEdgeRow);
    }

    async getEdgesTo(targetId: string): Promise<EdgeRecord[]> {
        const rows = await all<SqliteEdgeRow>(this.db, 'SELECT * FROM edges WHERE target_id = ?', targetId);
        return rows.map(mapEdgeRow);
    }

    /** Batched fetch of every edge touching any of the given node ids (source or target). */
    async getEdgesForNodes(nodeIds: readonly string[]): Promise<EdgeRecord[]> {
        if (nodeIds.length === 0) {
            return [];
        }
        const placeholders = nodeIds.map(() => '?').join(',');
        const rows = await all<SqliteEdgeRow>(
            this.db,
            `SELECT * FROM edges WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
            ...nodeIds,
            ...nodeIds
        );
        return rows.map(mapEdgeRow);
    }

    /** Batched fetch of idea summaries by id, preserving no particular order. */
    async getIdeasByIds(ids: readonly string[]): Promise<IdeaSummary[]> {
        if (ids.length === 0) {
            return [];
        }
        const placeholders = ids.map(() => '?').join(',');
        const rows = await all<SummaryRow>(
            this.db,
            `SELECT id, name, kind, file_uri, line_start, summary, attributes_json
             FROM ideas WHERE id IN (${placeholders})`,
            ...ids
        );
        return rows.map(row => this.toSummary(row));
    }

    async getEdgesReferencingFile(filePath: string): Promise<EdgeRecord[]> {
        const rows = await all<SqliteEdgeRow>(this.db, `
            SELECT * FROM edges
            WHERE target_file LIKE ? OR target_file LIKE ?
        `, `%${filePath}%`, filePath);
        return rows.map(mapEdgeRow);
    }

    async getAllEdges(): Promise<EdgeRecord[]> {
        const rows = await all<SqliteEdgeRow>(this.db, 'SELECT * FROM edges');
        return rows.map(mapEdgeRow);
    }

    async getAllIdeasRaw(): Promise<IdeaRecord[]> {
        const rows = await all<SqliteIdeaRow>(this.db, 'SELECT * FROM ideas');
        return rows.map(mapIdeaRow);
    }

    async updateGitDates(id: string, createdAt?: string, modifiedAt?: string): Promise<void> {
        await run(this.db, `
            UPDATE ideas SET git_created_at = ?, git_modified_at = ?
            WHERE id = ?
        `, createdAt ?? null, modifiedAt ?? null, id);
    }

    async counts(): Promise<{ ideas: number; edges: number }> {
        const ideas = (await get<{ count: number }>(this.db, 'SELECT COUNT(*) as count FROM ideas'))!.count;
        const edges = (await get<{ count: number }>(this.db, 'SELECT COUNT(*) as count FROM edges'))!.count;
        return { ideas, edges };
    }

    async getAttributeCatalog(): Promise<{ keys: string[]; valuesByKey: Record<string, string[]> }> {
        const ideas = await this.getAllIdeasRaw();
        const keys = new Set<string>();
        const valuesByKey = new Map<string, Set<string>>();
        for (const idea of ideas) {
            const attributes = parseAttributes(idea.attributesJson);
            for (const [key, value] of Object.entries(attributes)) {
                keys.add(key);
                if (!valuesByKey.has(key)) {
                    valuesByKey.set(key, new Set());
                }
                const bucket = valuesByKey.get(key)!;
                if (typeof value === 'string' && value) {
                    bucket.add(value);
                } else if (Array.isArray(value)) {
                    for (const entry of value) {
                        if (entry) {
                            bucket.add(String(entry));
                        }
                    }
                }
            }
        }
        return {
            keys: [...keys].sort((left, right) => left.localeCompare(right)),
            valuesByKey: Object.fromEntries(
                [...valuesByKey.entries()].map(([key, values]) => [key, [...values].sort()])
            )
        };
    }

    async searchByNameOrSummary(query: string): Promise<IdeaSummary[]> {
        const pattern = `%${query}%`;
        const rows = await all<SummaryRow>(this.db, `
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
            FROM ideas
            WHERE name LIKE ? OR summary LIKE ?
            ORDER BY name
        `, pattern, pattern);
        return rows.map(row => this.toSummary(row));
    }

    async listIdeasForGraphQuery(
        query: GraphViewQuery,
        limit: number
    ): Promise<{ candidates: IdeaSummary[]; totalMatching: number }> {
        const { sql, params } = buildGraphFilterWhereClause(query);
        const totalMatching = (await get<{ count: number }>(
            this.db,
            `SELECT COUNT(*) as count FROM ideas i WHERE ${sql}`,
            ...params
        ))!.count;
        const rows = await all<SummaryRow>(this.db, `
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
            FROM ideas i
            WHERE ${sql}
            ORDER BY i.file_uri ASC, i.line_start ASC
            LIMIT ?
        `, ...params, limit);
        return {
            candidates: rows.map(row => this.toSummary(row)),
            totalMatching
        };
    }

    async countIdeas(query: IdeasTableQuery = { page: 0, pageSize: 50, attributeColumns: [], referenceFilters: [] }): Promise<number> {
        const { sql, params } = buildIdeasWhereClause(query);
        return (await get<{ count: number }>(
            this.db,
            `SELECT COUNT(*) as count FROM ideas i WHERE ${sql}`,
            ...params
        ))!.count;
    }

    async listIdeasPage(query: IdeasTableQuery): Promise<IdeaTableRow[]> {
        const { sql: whereSql, params: whereParams } = buildIdeasWhereClause(query);
        const orderSql = buildIdeasOrderClause(query);
        const rows = await all<IdeaPageRow>(this.db, `
            SELECT
                i.id,
                i.name,
                i.file_uri,
                i.line_start,
                i.summary,
                i.attributes_json,
                (
                    SELECT COUNT(*)
                    FROM edges e
                    WHERE e.source_id = i.id
                ) AS outbound_count,
                (
                    SELECT COUNT(*)
                    FROM edges e
                    WHERE e.target_id = i.id
                ) AS inbound_count,
                (
                    SELECT COUNT(*)
                    FROM edges e
                    WHERE e.source_id = i.id OR e.target_id = i.id
                ) AS reference_count
            FROM ideas i
            WHERE ${whereSql}
            ORDER BY ${orderSql}
            LIMIT ? OFFSET ?
        `, ...whereParams, query.pageSize, query.page * query.pageSize);
        const ideaIds = rows.map(row => row.id);
        const referencesByIdea = await this.listReferenceChipsForIdeas(ideaIds);
        return rows.map(row => {
            const references = referencesByIdea.get(row.id) ?? { outbound: [], inbound: [] };
            return toIdeaTableRow(row, query.attributeColumns, references.outbound, references.inbound);
        });
    }

    async listReferenceChipsForIdeas(
        ideaIds: string[]
    ): Promise<Map<string, { outbound: IdeaReferenceChip[]; inbound: IdeaReferenceChip[] }>> {
        const result = new Map<string, { outbound: IdeaReferenceChip[]; inbound: IdeaReferenceChip[] }>();
        if (ideaIds.length === 0) {
            return result;
        }
        const placeholders = ideaIds.map(() => '?').join(', ');
        const rows = await all<ReferenceChipRow>(this.db, `
            SELECT
                e.id,
                e.kind,
                e.source_id,
                e.target_id,
                e.target_file,
                e.label,
                si.name AS source_name,
                si.file_uri AS source_uri,
                si.line_start AS source_line,
                ti.name AS target_name,
                ti.file_uri AS target_uri,
                ti.line_start AS target_line
            FROM edges e
            JOIN ideas si ON si.id = e.source_id
            LEFT JOIN ideas ti ON ti.id = e.target_id
            WHERE e.source_id IN (${placeholders}) OR e.target_id IN (${placeholders})
            ORDER BY e.id
        `, ...ideaIds, ...ideaIds);
        for (const ideaId of ideaIds) {
            result.set(ideaId, { outbound: [], inbound: [] });
        }
        for (const row of rows) {
            if (ideaIds.includes(row.source_id)) {
                result.get(row.source_id)!.outbound.push(toOutgoingReferenceChip(row));
            }
            if (row.target_id && ideaIds.includes(row.target_id)) {
                result.get(row.target_id)!.inbound.push(toIncomingReferenceChip(row));
            }
        }
        return result;
    }

    async countIdeasets(query: IdeasetsTableQuery = { page: 0, pageSize: 50 }): Promise<number> {
        const { sql, params } = buildIdeasetsWhereClause(query);
        const row = await get<{ count: number }>(this.db, `
            SELECT COUNT(*) AS count
            FROM (
                SELECT
                    d.file_uri AS id,
                    'file' AS kind,
                    d.file_uri AS file_uri,
                    0 AS line_start,
                    NULL AS name,
                    (
                        SELECT COUNT(*)
                        FROM ideas i
                        WHERE i.file_uri = d.file_uri
                    ) AS member_count
                FROM documents d
                UNION ALL
                SELECT
                    i.id,
                    'explicit' AS kind,
                    i.file_uri,
                    i.line_start,
                    i.name,
                    (
                        SELECT COUNT(*)
                        FROM edges e
                        WHERE e.source_id = i.id AND e.kind = 'ideaset_member'
                    ) AS member_count
                FROM ideas i
                WHERE i.kind = 'ideaset'
            ) ideasets
            WHERE ${sql}
        `, ...params);
        return row?.count ?? 0;
    }

    async listIdeasetsPage(query: IdeasetsTableQuery): Promise<IdeasetTableRow[]> {
        const { sql: whereSql, params: whereParams } = buildIdeasetsWhereClause(query);
        const orderSql = buildIdeasetsOrderClause(query);
        const rows = await all<IdeasetPageRow>(this.db, `
            SELECT *
            FROM (
                SELECT
                    d.file_uri AS id,
                    'file' AS kind,
                    d.file_uri AS file_uri,
                    0 AS line_start,
                    NULL AS name,
                    (
                        SELECT COUNT(*)
                        FROM ideas i
                        WHERE i.file_uri = d.file_uri
                    ) AS member_count
                FROM documents d
                UNION ALL
                SELECT
                    i.id,
                    'explicit' AS kind,
                    i.file_uri,
                    i.line_start,
                    i.name,
                    (
                        SELECT COUNT(*)
                        FROM edges e
                        WHERE e.source_id = i.id AND e.kind = 'ideaset_member'
                    ) AS member_count
                FROM ideas i
                WHERE i.kind = 'ideaset'
            ) ideasets
            WHERE ${whereSql}
            ORDER BY ${orderSql}
            LIMIT ? OFFSET ?
        `, ...whereParams, query.pageSize, query.page * query.pageSize);
        const ideasets = rows.map(row => toIdeasetTableRow(row));
        return Promise.all(ideasets.map(async ideaset => ({
            ...ideaset,
            members: await this.listIdeasetMembers(ideaset.id, ideaset.kind, ideaset.fileUri)
        })));
    }

    async listIdeasetMembers(
        ideasetId: string,
        kind: IdeasetKind,
        fileUri: string
    ): Promise<IdeasetMemberRow[]> {
        const rows = kind === 'file'
            ? await all<IdeasetMemberPageRow>(this.db, `
                SELECT name, file_uri, line_start
                FROM ideas
                WHERE file_uri = ? AND kind != 'ideaset'
                ORDER BY line_start
            `, fileUri)
            : await all<IdeasetMemberPageRow>(this.db, `
                SELECT i.name, i.file_uri, i.line_start
                FROM edges e
                JOIN ideas i ON i.id = e.target_id
                WHERE e.source_id = ? AND e.kind = 'ideaset_member'
                ORDER BY i.line_start
            `, ideasetId);
        return rows.map(row => ({
            name: row.name,
            fileUri: row.file_uri,
            lineStart: row.line_start
        }));
    }

    async countReferences(query: ReferencesTableQuery = { page: 0, pageSize: 50 }): Promise<number> {
        const { sql, params } = buildReferencesWhereClause(query);
        return (await get<{ count: number }>(
            this.db,
            `
            SELECT COUNT(*) as count
            FROM edges e
            JOIN ideas si ON si.id = e.source_id
            LEFT JOIN ideas ti ON ti.id = e.target_id
            WHERE ${sql}
        `,
            ...params
        ))!.count;
    }

    async listReferencesPage(query: ReferencesTableQuery): Promise<ReferenceTableRow[]> {
        const { sql: whereSql, params: whereParams } = buildReferencesWhereClause(query);
        const orderSql = buildReferencesOrderClause(query);
        const rows = await all<ReferencePageRow>(this.db, `
            SELECT
                e.kind,
                e.target_id,
                e.target_file,
                e.label,
                si.name AS source_name,
                si.file_uri AS source_uri,
                si.line_start AS source_line,
                ti.name AS target_name,
                ti.file_uri AS target_uri
            FROM edges e
            JOIN ideas si ON si.id = e.source_id
            LEFT JOIN ideas ti ON ti.id = e.target_id
            WHERE ${whereSql}
            ORDER BY ${orderSql}
            LIMIT ? OFFSET ?
        `, ...whereParams, query.pageSize, query.page * query.pageSize);
        return rows.map(row => toReferenceTableRow(row));
    }

    private toSummary(row: SummaryRow): IdeaSummary {
        const attributes = parseAttributes(row.attributes_json);
        return {
            id: row.id,
            name: row.name,
            kind: row.kind as IdeaSummary['kind'],
            fileUri: row.file_uri,
            lineStart: row.line_start,
            summary: row.summary,
            status: ideaStatus(attributes),
            tags: ideaTags(attributes),
            gitCreatedAt: row.git_created_at ?? undefined,
            gitModifiedAt: row.git_modified_at ?? undefined
        };
    }

    private async migrate(): Promise<void> {
        for (const statement of BASE_MIGRATIONS) {
            await exec(this.db, statement);
        }

        const currentVersion = Number(
            (await get<{ value: string }>(this.db, `SELECT value FROM meta WHERE key = 'schema_version'`))?.value ?? '1'
        );

        for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
            const steps = VERSION_MIGRATIONS[version] ?? [];
            for (const statement of steps) {
                try {
                    await exec(this.db, statement);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (!message.includes('duplicate column')) {
                        throw error;
                    }
                }
            }
        }

        await run(this.db, `
            INSERT INTO meta (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, 'schema_version', String(SCHEMA_VERSION));
    }
}

async function openDatabase(path: string): Promise<SqliteDatabase> {
    await mkdir(dirname(path), { recursive: true });
    const SQL = await getSqlJsModule();
    const bytes = await readDatabaseBytes(path);
    return {
        db: bytes ? new SQL.Database(bytes) : new SQL.Database(),
        dbPath: path,
        inTransaction: false,
        dirty: false
    };
}

async function closeDatabase(db: SqliteDatabase): Promise<void> {
    await persistDatabase(db);
    db.db.close();
}

async function run(db: SqliteDatabase, sql: string, ...params: unknown[]): Promise<void> {
    db.db.run(sql, params);
    const statementKind = classifyStatement(sql);
    if (statementKind === 'begin') {
        db.inTransaction = true;
        return;
    }
    if (statementKind === 'commit') {
        db.inTransaction = false;
        db.dirty = true;
        await persistDatabase(db);
        return;
    }
    if (statementKind === 'rollback') {
        db.inTransaction = false;
        db.dirty = false;
        return;
    }
    if (statementKind === 'write') {
        db.dirty = true;
        if (!db.inTransaction) {
            await persistDatabase(db);
        }
    }
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

async function exec(db: SqliteDatabase, sql: string): Promise<void> {
    db.db.exec(sql);
    db.dirty = true;
    if (!db.inTransaction) {
        await persistDatabase(db);
    }
}

let sqlJsModulePromise: Promise<SqlJsModule> | undefined;

async function getSqlJsModule(): Promise<SqlJsModule> {
    sqlJsModulePromise ??= initSqlJs({}) as Promise<SqlJsModule>;
    return sqlJsModulePromise;
}

async function readDatabaseBytes(path: string): Promise<Uint8Array | undefined> {
    try {
        const file = await readFile(path);
        return new Uint8Array(file);
    } catch (error) {
        if (isMissingFileError(error)) {
            return undefined;
        }
        throw error;
    }
}

async function persistDatabase(db: SqliteDatabase): Promise<void> {
    if (!db.dirty) {
        return;
    }
    await writeFile(db.dbPath, db.db.export());
    db.dirty = false;
}

function classifyStatement(sql: string): 'begin' | 'commit' | 'rollback' | 'write' | 'read' {
    const keyword = sql.trimStart().match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
    if (keyword === 'BEGIN') {
        return 'begin';
    }
    if (keyword === 'COMMIT') {
        return 'commit';
    }
    if (keyword === 'ROLLBACK') {
        return 'rollback';
    }
    if (keyword && ['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'DROP', 'ALTER', 'PRAGMA'].includes(keyword)) {
        return 'write';
    }
    return 'read';
}

function isMissingFileError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ENOENT';
}

interface SummaryRow {
    id: string;
    name: string;
    kind: string;
    file_uri: string;
    line_start: number;
    summary: string;
    attributes_json: string;
    git_created_at?: string | null;
    git_modified_at?: string | null;
}

interface IdeaPageRow {
    id: string;
    name: string;
    file_uri: string;
    line_start: number;
    summary: string;
    attributes_json: string;
    outbound_count: number;
    inbound_count: number;
    reference_count: number;
}

interface IdeasetPageRow {
    id: string;
    kind: 'file' | 'explicit';
    file_uri: string;
    line_start: number;
    name: string | null;
    member_count: number;
}

interface IdeasetMemberPageRow {
    name: string;
    file_uri: string;
    line_start: number;
}

interface ReferencePageRow {
    kind: string;
    target_id: string | null;
    target_file: string | null;
    label: string | null;
    source_name: string;
    source_uri: string;
    source_line: number;
    target_name: string | null;
    target_uri: string | null;
}

function toIdeaTableRow(
    row: IdeaPageRow,
    attributeColumns: string[],
    outboundReferences: IdeaReferenceChip[],
    inboundReferences: IdeaReferenceChip[]
): IdeaTableRow {
    const attributes = parseAttributes(row.attributes_json);
    const otherAttributeItems = formatOtherAttributeItems(attributes);
    const fanout = row.inbound_count + row.outbound_count;
    const stabilityCue = Math.min(1, Math.max(0, 1 - fanout / 24));
    const stabilityLabel =
        stabilityCue >= 0.75 ? 'Stable' : stabilityCue >= 0.45 ? 'Active' : 'High churn risk';
    return {
        id: row.id,
        title: row.name,
        path: row.file_uri,
        mainAttribute: row.summary || undefined,
        otherAttributes: otherAttributeItems.join('; '),
        otherAttributeItems,
        attributeValues: attributeValuesForKeys(row.attributes_json, attributeColumns),
        referenceCount: row.reference_count,
        outboundCount: row.outbound_count,
        inboundCount: row.inbound_count,
        outboundReferences,
        inboundReferences,
        fileUri: row.file_uri,
        lineStart: row.line_start,
        stabilityCue,
        stabilityLabel
    };
}

function toIdeasetTableRow(row: IdeasetPageRow): IdeasetTableRow {
    const name = row.kind === 'explicit' && row.name
        ? row.name
        : implicitIdeasetName(row.file_uri);
    return {
        id: row.id,
        name,
        path: row.file_uri,
        kind: row.kind,
        memberCount: row.member_count,
        members: [],
        fileUri: row.file_uri,
        lineStart: row.line_start
    };
}

function implicitIdeasetName(fileUri: string): string {
    const fileName = basename(fileUri);
    return fileName.endsWith('.rq') ? fileName.slice(0, -3) : fileName;
}

function formatOtherAttributeItems(attributes: ReturnType<typeof parseAttributes>): string[] {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(attributes)) {
        let rendered: string | undefined;
        if (typeof value === 'string' && value) {
            rendered = `${key}: ${value}`;
        } else if (Array.isArray(value) && value.length > 0) {
            rendered = `${key}: ${value.join(', ')}`;
        } else if (value === true) {
            rendered = key;
        }
        if (rendered) {
            parts.push(rendered);
        }
    }
    return parts;
}

interface ReferenceChipRow {
    id: string;
    kind: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    label: string | null;
    source_name: string;
    source_uri: string;
    source_line: number;
    target_name: string | null;
    target_uri: string | null;
    target_line: number | null;
}

function toOutgoingReferenceChip(row: ReferenceChipRow): IdeaReferenceChip {
    const targetName = row.target_name ?? row.label ?? row.target_file ?? '—';
    const filterKey = row.target_id
        ? `outbound:idea:${row.target_id}`
        : `outbound:file:${row.target_file ?? row.label ?? ''}`;
    return {
        label: targetName,
        fileUri: row.target_uri ?? row.source_uri,
        line: row.target_line ?? row.source_line,
        direction: 'outbound',
        filterKey
    };
}

function toIncomingReferenceChip(row: ReferenceChipRow): IdeaReferenceChip {
    return {
        label: row.source_name,
        fileUri: row.source_uri,
        line: row.source_line,
        direction: 'inbound',
        filterKey: `inbound:idea:${row.source_id}`
    };
}

function toReferenceTableRow(row: ReferencePageRow): ReferenceTableRow {
    const targetPath = row.target_uri ?? row.target_file ?? '';
    const targetName = row.target_name ?? row.label ?? row.target_file ?? '—';
    return {
        sourcePath: row.source_uri,
        sourceName: row.source_name,
        targetPath,
        targetName,
        isInRq: row.target_id !== null,
        referenceType: toReferenceViewType(row.kind as EdgeKind),
        sourceFileUri: row.source_uri,
        sourceLineStart: row.source_line
    };
}

function toReferenceViewType(kind: EdgeKind): ReferenceViewType {
    switch (kind) {
        case 'file_reference':
            return 'file';
        case 'comment_link':
            return 'comment';
        default:
            return 'sub-idea';
    }
}

interface SummaryRowWithEnd extends SummaryRow {
    line_end: number;
}
interface ReferenceListSqlRow {
    edge_id: string;
    kind: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    label: string | null;
    source_line: number | null;
    snippet: string | null;
    is_resolved: number | null;
    target_name?: string | null;
    target_uri?: string | null;
    target_line?: number | null;
    source_name?: string | null;
    source_uri?: string | null;
    source_line_idea?: number | null;
}

function toOutboundReferenceListRow(row: ReferenceListSqlRow): ReferenceListRow {
    const targetName = row.target_name ?? row.label ?? row.target_file ?? 'unknown';
    const targetPath = row.target_uri ?? row.target_file ?? '';
    return {
        edgeId: row.edge_id,
        direction: 'outbound',
        kind: row.kind as EdgeKind,
        label: row.label ?? targetName,
        targetName,
        targetPath,
        targetLine: row.target_line ?? undefined,
        sourceLine: row.source_line ?? undefined,
        snippet: row.snippet ?? undefined,
        isResolved: row.is_resolved !== 0,
        sourceIdeaId: row.source_id,
        targetIdeaId: row.target_id ?? undefined
    };
}

function toInboundReferenceListRow(row: ReferenceListSqlRow): ReferenceListRow {
    const targetName = row.source_name ?? 'unknown';
    const targetPath = row.source_uri ?? '';
    return {
        edgeId: row.edge_id,
        direction: 'inbound',
        kind: row.kind as EdgeKind,
        label: row.label ?? targetName,
        targetName,
        targetPath,
        targetLine: row.source_line_idea ?? undefined,
        sourceLine: row.source_line ?? undefined,
        snippet: row.snippet ?? undefined,
        isResolved: row.is_resolved !== 0,
        sourceIdeaId: row.source_id,
        targetIdeaId: row.target_id ?? undefined
    };
}

interface SqliteEdgeRow {
    id: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    kind: string;
    label: string | null;
    source_line?: number | null;
    snippet?: string | null;
    is_resolved?: number | null;
}

interface SqliteIdeaRow {
    id: string;
    name: string;
    kind: string;
    file_uri: string;
    line_start: number;
    line_end: number;
    summary: string;
    attributes_json: string;
    content_hash: string;
    git_created_at: string | null;
    git_modified_at: string | null;
}

function mapEdgeRow(row: SqliteEdgeRow): EdgeRecord {
    return {
        id: row.id,
        sourceId: row.source_id,
        targetId: row.target_id ?? undefined,
        targetFile: row.target_file ?? undefined,
        kind: row.kind as EdgeKind,
        label: row.label ?? undefined,
        sourceLine: row.source_line ?? undefined,
        snippet: row.snippet ?? undefined,
        isResolved: row.is_resolved === undefined || row.is_resolved === null
            ? true
            : row.is_resolved !== 0
    };
}

function mapIdeaRow(row: SqliteIdeaRow): IdeaRecord {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind as IdeaRecord['kind'],
        fileUri: row.file_uri,
        lineStart: row.line_start,
        lineEnd: row.line_end,
        summary: row.summary,
        attributesJson: row.attributes_json,
        contentHash: row.content_hash,
        gitCreatedAt: row.git_created_at ?? undefined,
        gitModifiedAt: row.git_modified_at ?? undefined
    };
}

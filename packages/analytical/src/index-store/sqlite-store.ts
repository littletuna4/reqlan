/**
 * SQLite-backed persistence for the workspace idea graph index.
 */
import sqlite3 from 'sqlite3';
import { mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { MIGRATIONS, SCHEMA_VERSION } from './schema.js';
import type {
    EdgeKind,
    EdgeRecord,
    IdeaRecord,
    IdeaReferenceChip,
    IdeaSummary,
    IdeasetKind,
    IdeasetMemberRow,
    IdeasetTableRow,
    IdeaTableRow,
    ReferenceTableRow,
    ReferenceViewType
} from '../core/types.js';
import { ideaStatus, ideaTags, parseAttributes } from '../core/types.js';
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

type SqliteDatabase = sqlite3.Database;

export class SqliteIndexStore {
    private readonly db: SqliteDatabase;

    private constructor(db: SqliteDatabase) {
        this.db = db;
    }

    static async open(dbPath: string): Promise<SqliteIndexStore> {
        mkdirSync(dirname(dbPath), { recursive: true });
        const db = await openDatabase(dbPath);
        await run(db, 'PRAGMA journal_mode = WAL');
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
                INSERT OR IGNORE INTO edges (id, source_id, target_id, target_file, kind, label)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            for (const edge of edges) {
                await run(this.db, insertEdgeSql,
                    edge.id,
                    edge.sourceId,
                    edge.targetId ?? null,
                    edge.targetFile ?? null,
                    edge.kind,
                    edge.label ?? null
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
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
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

    async getEdgesFrom(sourceId: string): Promise<EdgeRecord[]> {
        const rows = await all<SqliteEdgeRow>(this.db, 'SELECT * FROM edges WHERE source_id = ?', sourceId);
        return rows.map(mapEdgeRow);
    }

    async getEdgesTo(targetId: string): Promise<EdgeRecord[]> {
        const rows = await all<SqliteEdgeRow>(this.db, 'SELECT * FROM edges WHERE target_id = ?', targetId);
        return rows.map(mapEdgeRow);
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
            tags: ideaTags(attributes)
        };
    }

    private async migrate(): Promise<void> {
        for (const statement of MIGRATIONS) {
            await exec(this.db, statement);
        }
        await run(this.db, `
            INSERT INTO meta (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, 'schema_version', String(SCHEMA_VERSION));
    }
}

function openDatabase(path: string): Promise<SqliteDatabase> {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(path, error => {
            if (error) {
                reject(error);
            } else {
                resolve(db);
            }
        });
    });
}

function closeDatabase(db: SqliteDatabase): Promise<void> {
    return new Promise((resolve, reject) => {
        db.close(error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function run(db: SqliteDatabase, sql: string, ...params: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(sql, params, error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function get<T>(db: SqliteDatabase, sql: string, ...params: unknown[]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) {
                reject(error);
            } else {
                resolve(row as T | undefined);
            }
        });
    });
}

function all<T>(db: SqliteDatabase, sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) {
                reject(error);
            } else {
                resolve(rows as T[]);
            }
        });
    });
}

function exec(db: SqliteDatabase, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
        db.exec(sql, error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

interface SummaryRow {
    id: string;
    name: string;
    kind: string;
    file_uri: string;
    line_start: number;
    summary: string;
    attributes_json: string;
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
        lineStart: row.line_start
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

interface SqliteEdgeRow {
    id: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    kind: string;
    label: string | null;
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
        label: row.label ?? undefined
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

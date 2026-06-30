/**
 * SQLite-backed persistence for the workspace idea graph index.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS, SCHEMA_VERSION } from './schema.js';
import type { EdgeKind, EdgeRecord, IdeaRecord, IdeaSummary } from '../core/types.js';
import { ideaStatus, ideaTags, parseAttributes } from '../core/types.js';

export class SqliteIndexStore {
    private readonly db: Database.Database;

    constructor(dbPath: string) {
        mkdirSync(dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.migrate();
    }

    close(): void {
        this.db.close();
    }

    getDocumentHash(fileUri: string): string | undefined {
        const row = this.db.prepare('SELECT content_hash FROM documents WHERE file_uri = ?').get(fileUri) as
            | { content_hash: string }
            | undefined;
        return row?.content_hash;
    }

    upsertDocument(fileUri: string, contentHash: string, ideas: IdeaRecord[], edges: EdgeRecord[]): void {
        this.db.exec('BEGIN');
        try {
            this.db.prepare('DELETE FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?)').run(fileUri);
            this.db.prepare('DELETE FROM ideas WHERE file_uri = ?').run(fileUri);

            const insertIdea = this.db.prepare(`
                INSERT INTO ideas (
                    id, name, kind, file_uri, line_start, line_end, summary,
                    attributes_json, content_hash, git_created_at, git_modified_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?
                )
            `);
            for (const idea of ideas) {
                insertIdea.run(
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

            const insertEdge = this.db.prepare(`
                INSERT OR IGNORE INTO edges (id, source_id, target_id, target_file, kind, label)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            for (const edge of edges) {
                insertEdge.run(
                    edge.id,
                    edge.sourceId,
                    edge.targetId ?? null,
                    edge.targetFile ?? null,
                    edge.kind,
                    edge.label ?? null
                );
            }

            this.db.prepare(`
                INSERT INTO documents (file_uri, content_hash, indexed_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(file_uri) DO UPDATE SET
                    content_hash = excluded.content_hash,
                    indexed_at = excluded.indexed_at
            `).run(fileUri, contentHash);
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    removeDocument(fileUri: string): void {
        this.db.exec('BEGIN');
        try {
            this.db.prepare('DELETE FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?)').run(fileUri);
            this.db.prepare('DELETE FROM ideas WHERE file_uri = ?').run(fileUri);
            this.db.prepare('DELETE FROM documents WHERE file_uri = ?').run(fileUri);
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    listAllIdeas(): IdeaSummary[] {
        const rows = this.db.prepare(`
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
            FROM ideas
            ORDER BY file_uri, line_start
        `).all() as SummaryRow[];
        return rows.map(row => this.toSummary(row));
    }

    getIdea(id: string): IdeaSummary | undefined {
        const row = this.db.prepare(`
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
            FROM ideas WHERE id = ?
        `).get(id) as SummaryRow | undefined;
        return row ? this.toSummary(row) : undefined;
    }

    getIdeasInFile(fileUri: string): IdeaSummary[] {
        const rows = this.db.prepare(`
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
            FROM ideas WHERE file_uri = ?
            ORDER BY line_start
        `).all(fileUri) as SummaryRow[];
        return rows.map(row => this.toSummary(row));
    }

    getEdgesFrom(sourceId: string): EdgeRecord[] {
        const rows = this.db.prepare('SELECT * FROM edges WHERE source_id = ?').all(sourceId) as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    getEdgesTo(targetId: string): EdgeRecord[] {
        const rows = this.db.prepare('SELECT * FROM edges WHERE target_id = ?').all(targetId) as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    getEdgesReferencingFile(filePath: string): EdgeRecord[] {
        const rows = this.db.prepare(`
            SELECT * FROM edges
            WHERE target_file LIKE ? OR target_file LIKE ?
        `).all(`%${filePath}%`, filePath) as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    getAllEdges(): EdgeRecord[] {
        const rows = this.db.prepare('SELECT * FROM edges').all() as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    getAllIdeasRaw(): IdeaRecord[] {
        const rows = this.db.prepare('SELECT * FROM ideas').all() as SqliteIdeaRow[];
        return rows.map(mapIdeaRow);
    }

    updateGitDates(id: string, createdAt?: string, modifiedAt?: string): void {
        this.db.prepare(`
            UPDATE ideas SET git_created_at = ?, git_modified_at = ?
            WHERE id = ?
        `).run(createdAt ?? null, modifiedAt ?? null, id);
    }

    counts(): { ideas: number; edges: number } {
        const ideas = (this.db.prepare('SELECT COUNT(*) as count FROM ideas').get() as { count: number }).count;
        const edges = (this.db.prepare('SELECT COUNT(*) as count FROM edges').get() as { count: number }).count;
        return { ideas, edges };
    }

    searchByNameOrSummary(query: string): IdeaSummary[] {
        const pattern = `%${query}%`;
        const rows = this.db.prepare(`
            SELECT id, name, kind, file_uri, line_start, summary, attributes_json
            FROM ideas
            WHERE name LIKE ? OR summary LIKE ?
            ORDER BY name
        `).all(pattern, pattern) as SummaryRow[];
        return rows.map(row => this.toSummary(row));
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

    private migrate(): void {
        for (const statement of MIGRATIONS) {
            this.db.exec(statement);
        }
        this.db.prepare(`
            INSERT INTO meta (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run('schema_version', String(SCHEMA_VERSION));
    }
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

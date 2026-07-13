/**
 * SQLite schema for the workspace idea graph index.
 */

export const SCHEMA_VERSION = 2;

/** Initial schema — always safe to re-run (IF NOT EXISTS). */
export const BASE_MIGRATIONS: string[] = [
    `CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_uri TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        summary TEXT NOT NULL,
        attributes_json TEXT NOT NULL DEFAULT '{}',
        content_hash TEXT NOT NULL,
        git_created_at TEXT,
        git_modified_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ideas_file ON ideas(file_uri)`,
    `CREATE INDEX IF NOT EXISTS idx_ideas_name ON ideas(name)`,
    `CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT,
        target_file TEXT,
        kind TEXT NOT NULL,
        label TEXT,
        FOREIGN KEY (source_id) REFERENCES ideas(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)`,
    `CREATE INDEX IF NOT EXISTS idx_edges_target_file ON edges(target_file)`,
    `CREATE TABLE IF NOT EXISTS documents (
        file_uri TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        indexed_at TEXT NOT NULL
    )`
];

/** Versioned migrations applied once when upgrading from an older schema_version. */
export const VERSION_MIGRATIONS: Record<number, string[]> = {
    2: [
        `ALTER TABLE edges ADD COLUMN source_line INTEGER`,
        `ALTER TABLE edges ADD COLUMN snippet TEXT`,
        `ALTER TABLE edges ADD COLUMN is_resolved INTEGER NOT NULL DEFAULT 1`
    ]
};

/** @deprecated Use BASE_MIGRATIONS — kept for tests referencing MIGRATIONS. */
export const MIGRATIONS = BASE_MIGRATIONS;

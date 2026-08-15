//! Schema version 4 for the shared `<base>/.reqlan` ideas index.
//! rq:["../../../reqlan rq/indexer/indexer.rq".index]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]

pub const SCHEMA_VERSION: i64 = 4;

pub const BASE_MIGRATIONS: &[&str] = &[
    r#"CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )"#,
    r#"CREATE TABLE IF NOT EXISTS ideas (
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
        git_modified_at TEXT,
        git_change_count INTEGER
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ideas_file ON ideas(file_uri)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_ideas_name ON ideas(name)"#,
    r#"CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT,
        target_file TEXT,
        kind TEXT NOT NULL,
        label TEXT,
        FOREIGN KEY (source_id) REFERENCES ideas(id) ON DELETE CASCADE
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_edges_target_file ON edges(target_file)"#,
    r#"CREATE TABLE IF NOT EXISTS documents (
        file_uri TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        indexed_at TEXT NOT NULL
    )"#,
];

pub fn version_migrations(version: i64) -> &'static [&'static str] {
    match version {
        2 => &[
            "ALTER TABLE edges ADD COLUMN source_line INTEGER",
            "ALTER TABLE edges ADD COLUMN snippet TEXT",
            "ALTER TABLE edges ADD COLUMN is_resolved INTEGER NOT NULL DEFAULT 1",
        ],
        3 => &["ALTER TABLE documents ADD COLUMN mtime_ms REAL"],
        4 => &["ALTER TABLE ideas ADD COLUMN git_change_count INTEGER"],
        _ => &[],
    }
}

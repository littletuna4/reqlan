/**
 * Generate schema v4 SQLite fixtures for sql.js ↔ rusqlite round-trip tests.
 *   node crates/reqlan-index/tests/fixtures/generate-schema-v4-fixtures.mjs
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlJsOut = path.join(here, 'schema-v4-sqljs.sqlite');
const rusqliteOut = path.join(here, 'schema-v4-rusqlite.sqlite');

const seed = `
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ideas (
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
);
CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT,
    target_file TEXT,
    kind TEXT NOT NULL,
    label TEXT,
    FOREIGN KEY (source_id) REFERENCES ideas(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS documents (
    file_uri TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    indexed_at TEXT NOT NULL
);
ALTER TABLE edges ADD COLUMN source_line INTEGER;
ALTER TABLE edges ADD COLUMN snippet TEXT;
ALTER TABLE edges ADD COLUMN is_resolved INTEGER NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN mtime_ms REAL;
INSERT INTO meta(key, value) VALUES ('schema_version', '4');
INSERT INTO ideas(id, name, kind, file_uri, line_start, line_end, summary, attributes_json, content_hash, git_change_count)
VALUES ('demo.rq#demo', 'demo', 'block', 'demo.rq', 0, 2, 'body', '{}', 'x', 3);
INSERT INTO documents(file_uri, content_hash, indexed_at, mtime_ms)
VALUES ('demo.rq', 'x', '2024-01-01T00:00:00Z', 1700000000000);
`;

const analyticalRequire = createRequire(
    path.join(here, '../../../../packages/analytical/package.json')
);
const initSqlJsMod = analyticalRequire('sql.js/dist/sql-asm.js');
const initSqlJs = initSqlJsMod.default ?? initSqlJsMod;
const SQL = await initSqlJs({});
const db = new SQL.Database();
db.run(seed);
fs.writeFileSync(sqlJsOut, Buffer.from(db.export()));
db.close();
console.log(`wrote ${sqlJsOut}`);

for (const file of [rusqliteOut, `${rusqliteOut}-wal`, `${rusqliteOut}-shm`]) {
    if (fs.existsSync(file)) {
        fs.rmSync(file);
    }
}
const python = spawnSync(
    'python3',
    ['-c', `import sqlite3,sys; conn=sqlite3.connect(sys.argv[1]); conn.executescript(sys.stdin.read()); conn.commit(); conn.close()` , rusqliteOut],
    { input: seed, encoding: 'utf8' }
);
if (python.status === 0) {
    console.log(`wrote ${rusqliteOut}`);
} else {
    const sqlite3 = spawnSync('sqlite3', [rusqliteOut], { input: seed, encoding: 'utf8' });
    if (sqlite3.status === 0) {
        console.log(`wrote ${rusqliteOut}`);
    } else {
        fs.copyFileSync(sqlJsOut, rusqliteOut);
        console.log(`copied sql.js fixture to ${rusqliteOut}`);
    }
}

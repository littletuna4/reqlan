/**
 * Schema v4 file compatibility via the native rusqlite store.
 * rq:["../../reqlan rq/core_analysis/rust_port.rq".cutover]
 */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { WorkspaceIndex } from '../src/index-store/workspace-index.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';
import { SCHEMA_VERSION } from '../src/index-store/schema.js';
import { IDEAS_INDEX_FILENAME } from '../src/core/application-memory.js';
import { NativeSqlConnection } from '../src/native/native-sql-db.js';
import { resetNativeEngineCache } from '../src/native/load-native.js';

const here = dirname(fileURLToPath(import.meta.url));
const rusqliteFixture = join(
    here,
    '../../../crates/reqlan-index/tests/fixtures/schema-v4-rusqlite.sqlite'
);

function sqlite3Available(): boolean {
    try {
        execFileSync('sqlite3', ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function columnNames(rows: Array<Record<string, unknown>>): string[] {
    return rows.map(row => String(row.name ?? Object.values(row)[1]));
}

describe('schema v4 round-trip', () => {
    test('native WorkspaceIndex persists schema version 4 with git_change_count and mtime', async () => {
        resetNativeEngineCache();
        const root = join(tmpdir(), `reqlan-schema-v4-${randomUUID()}`);
        await mkdir(join(root, '.reqlan'), { recursive: true });
        await writeFile(join(root, 'demo.rq'), 'demo {\n    body\n    @status pending\n}\n', 'utf8');
        const index = new WorkspaceIndex(join(root, '.reqlan'), root);
        await index.activate();
        expect((await index.indexStore.counts()).ideas).toBeGreaterThan(0);
        await index.deactivate();

        const dbPath = join(root, '.reqlan', IDEAS_INDEX_FILENAME);
        const conn = await NativeSqlConnection.open(dbPath);
        const version = conn.get<{ value: string }>(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        );
        expect(Number(version?.value)).toBe(SCHEMA_VERSION);
        expect(columnNames(conn.all('PRAGMA table_info(ideas)'))).toContain('git_change_count');
        expect(columnNames(conn.all('PRAGMA table_info(documents)'))).toContain('mtime_ms');
        conn.close();

        if (sqlite3Available()) {
            const out = execFileSync('sqlite3', [dbPath, "SELECT value FROM meta WHERE key = 'schema_version';"], {
                encoding: 'utf8'
            });
            expect(out.trim()).toBe(String(SCHEMA_VERSION));
        }
    });

    test('native store can open a rusqlite-written schema v4 file', async () => {
        resetNativeEngineCache();
        expect(existsSync(rusqliteFixture), `missing ${rusqliteFixture}`).toBe(true);
        const copyPath = join(tmpdir(), `reqlan-schema-v4-copy-${randomUUID()}.sqlite`);
        await copyFile(rusqliteFixture, copyPath);
        const store = await SqliteIndexStore.open(copyPath);
        const ideas = await store.listAllIdeas();
        expect(ideas.some(idea => idea.name === 'demo')).toBe(true);
        await store.close();

        const conn = await NativeSqlConnection.open(copyPath);
        const version = conn.get<{ value: string }>(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        );
        expect(Number(version?.value)).toBe(4);
        conn.close();
    });
});

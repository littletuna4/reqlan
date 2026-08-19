/**
 * rq:["../../../reqlan rq/bases/base.rq".base_initialisation]
 * rq:["../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
 * rq:["../../../reqlan rq/extension/module/index.rq".rqignore_initialisation]
 */
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
    APPLICATION_MEMORY_DIR,
    CONFIG_FILENAME,
    GITIGNORE_FILENAME,
    RQIGNORE_FILENAME
} from '../src/core/application-memory.js';
import { createBase } from '../src/core/create-base.js';
import { DEFAULT_RQIGNORE_PATTERNS, defaultRqIgnoreFileContents } from '../src/core/rqignore.js';

const tempDirs: string[] = [];

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()!;
        rmSync(dir, { recursive: true, force: true });
    }
});

function tempRoot(): string {
    const dir = mkdtempSync(join(tmpdir(), 'reqlan-create-base-'));
    tempDirs.push(dir);
    return dir;
}

describe('createBase', () => {
    test('creates .reqlan marker and reports created', async () => {
        const root = tempRoot();
        const result = await createBase(root);
        expect(result.created).toBe(true);
        expect(existsSync(join(root, APPLICATION_MEMORY_DIR))).toBe(true);
        expect(result.base.root).toBe(root);
        expect(result.base.memoryPath).toBe(join(root, APPLICATION_MEMORY_DIR));
    });

    test('seeds .reqlan/config.json when creating a new base', async () => {
        const root = tempRoot();
        await createBase(root);
        const configPath = join(root, APPLICATION_MEMORY_DIR, CONFIG_FILENAME);
        expect(existsSync(configPath)).toBe(true);
        expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({});
    });

    test('seeds .reqlan/.rqignore when creating a new base', async () => {
        const root = tempRoot();
        await createBase(root);
        const ignorePath = join(root, APPLICATION_MEMORY_DIR, RQIGNORE_FILENAME);
        expect(existsSync(ignorePath)).toBe(true);
        const text = readFileSync(ignorePath, 'utf8');
        expect(text).toContain('# Purpose');
        expect(text).toContain('node_modules/');
        expect(text).toContain('*.db3');
        expect(text).toContain('*.bin');
        for (const pattern of DEFAULT_RQIGNORE_PATTERNS.slice(0, 5)) {
            expect(text).toContain(pattern);
        }
        expect(defaultRqIgnoreFileContents()).toContain('*.bin');
    });

    test('seeds .reqlan/.gitignore that excludes sqlite artifacts', async () => {
        const root = tempRoot();
        await createBase(root);
        const gitignorePath = join(root, APPLICATION_MEMORY_DIR, GITIGNORE_FILENAME);
        expect(existsSync(gitignorePath)).toBe(true);
        const text = readFileSync(gitignorePath, 'utf8');
        expect(text).toContain('*.sqlite');
        expect(text).toContain('*.sqlite-wal');
        expect(text).toContain('*.sqlite-shm');
        expect(text).toContain('*.sqlite-journal');
    });

    test('is idempotent when marker already exists', async () => {
        const root = tempRoot();
        const first = await createBase(root);
        const second = await createBase(root);
        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(existsSync(join(root, APPLICATION_MEMORY_DIR))).toBe(true);
    });
});

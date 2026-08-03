/**
 * rq:["../../reqlan rq/extension/configuration.rq".configuration_rqignore]
 * rq:["../../reqlan rq/extension/module/index.rq".rqignore]
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { APPLICATION_MEMORY_DIR, RQIGNORE_FILENAME } from '../src/core/application-memory.js';
import {
    createRqIgnoreFilter,
    defaultRqIgnoreFileContents,
    isIgnoredPath,
    loadRqIgnore
} from '../src/core/rqignore.js';

const temps: string[] = [];

afterEach(() => {
    for (const dir of temps.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'reqlan-rqignore-'));
    temps.push(dir);
    return dir;
}

describe('rqignore', () => {
    test('defaults ignore node_modules, venv, and db3 paths', () => {
        const filter = createRqIgnoreFilter();
        expect(filter.ignores('node_modules/', true)).toBe(true);
        expect(filter.ignores('node_modules/pkg/x.rq')).toBe(true);
        expect(filter.ignores('venv/', true)).toBe(true);
        expect(filter.ignores('.venv/lib/', true)).toBe(true);
        expect(filter.ignores('data/local.db3')).toBe(true);
        expect(filter.ignores('src/feature.rq')).toBe(false);
    });

    test('file patterns merge with defaults and support negation', () => {
        const filter = createRqIgnoreFilter('vendor/\n!venv/\n');
        expect(filter.ignores('vendor/lib/', true)).toBe(true);
        // Built-in venv/ plus later !venv/ — last matching rule wins in ignore.
        expect(filter.ignores('venv/', true)).toBe(false);
    });

    test('loadRqIgnore reads .reqlan/.rqignore under the base', () => {
        const root = tempDir();
        mkdirSync(join(root, APPLICATION_MEMORY_DIR), { recursive: true });
        writeFileSync(
            join(root, APPLICATION_MEMORY_DIR, RQIGNORE_FILENAME),
            'custom_skip/\n',
            'utf8'
        );
        const filter = loadRqIgnore(root);
        expect(isIgnoredPath(filter, root, join(root, 'custom_skip'), true)).toBe(true);
        expect(isIgnoredPath(filter, root, join(root, 'node_modules'), true)).toBe(true);
        expect(isIgnoredPath(filter, root, join(root, 'keep.rq'), false)).toBe(false);
    });

    test('defaultRqIgnoreFileContents documents gitignore-style defaults', () => {
        const text = defaultRqIgnoreFileContents();
        expect(text).toContain('node_modules/');
        expect(text).toContain('venv/');
        expect(text).toContain('*.db3');
        expect(text).toContain('gitignore');
    });
});

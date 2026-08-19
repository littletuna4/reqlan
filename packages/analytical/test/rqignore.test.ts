/**
 * rq:["../../reqlan rq/extension/configuration.rq".configuration_rqignore]
 * rq:["../../reqlan rq/extension/module/index.rq".rqignore]
 * rq:["../../reqlan rq/extension/module/index.rq".binary_ignore]
 * rq:["../../reqlan rq/extension/module/index.rq".rqignore_initialisation]
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
    test('defaults ignore node_modules, venv, db3, and binary paths', () => {
        const filter = createRqIgnoreFilter();
        expect(filter.ignores('node_modules/', true)).toBe(true);
        expect(filter.ignores('node_modules/pkg/x.rq')).toBe(true);
        expect(filter.ignores('venv/', true)).toBe(true);
        expect(filter.ignores('.venv/lib/', true)).toBe(true);
        expect(filter.ignores('data/local.db3')).toBe(true);
        expect(filter.ignores('assets/payload.bin')).toBe(true);
        expect(filter.ignores('photo.png')).toBe(true);
        expect(filter.ignores('src/feature.rq')).toBe(false);
    });

    test('file patterns merge with defaults and support negation', () => {
        const filter = createRqIgnoreFilter('vendor/\n!venv/\n');
        expect(filter.ignores('vendor/lib/', true)).toBe(true);
        // Built-in venv/ plus later !venv/ — last matching rule wins in ignore.
        expect(filter.ignores('venv/', true)).toBe(false);
    });

    test('inverse rqignore patterns opt binary files back in', () => {
        const filter = createRqIgnoreFilter('!*.bin\n');
        expect(filter.ignores('assets/payload.bin')).toBe(false);
        expect(filter.ignores('photo.png')).toBe(true);
        expect(filter.ignores('src/feature.rq')).toBe(false);
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
        expect(text).toContain('*.bin');
        expect(text).toContain('!*.bin');
        expect(text).toContain('gitignore');
    });

    test('seeded rqignore comments explain all features', () => {
        const text = defaultRqIgnoreFileContents();
        expect(text).toContain('# Purpose');
        expect(text).toContain('discovery and indexing');
        expect(text).toContain('parent of .reqlan');
        expect(text).toContain('not Git ignore');
        expect(text).toContain('last matching rule wins');
        expect(text).toContain('starts with !');
        expect(text).toContain('Built-in defaults always apply');
        expect(text).toContain('If you delete a line here');
        expect(text).toContain('Binary globs are skipped by default');
        expect(text).toContain('!*.bin');
        expect(text).toContain('rq: comment references');
        expect(text).toContain('Hidden paths');
        expect(text).toContain('*.secret.rq is skipped');
        expect(text).toContain('.reqlan/ is not crawled');
        expect(text).toContain('# Dependencies');
        expect(text).toContain('# Databases');
        for (const pattern of [
            'node_modules/',
            'venv/',
            '*.db3',
            '*.secret.rq',
            '.reqlan/',
            '*.bin'
        ]) {
            expect(text).toContain(pattern);
        }
    });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
    baseForPath,
    discoverBases,
    filesOwnedByBase,
    isPathInsideOrEqual,
    selectDefaultBase,
    toBaseDescriptor
} from '../src/core/base-discovery.js';
import { APPLICATION_MEMORY_DIR } from '../src/core/application-memory.js';

const temps: string[] = [];

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'reqlan-base-'));
    temps.push(dir);
    return dir;
}

function markBase(dir: string): void {
    mkdirSync(join(dir, APPLICATION_MEMORY_DIR), { recursive: true });
}

afterEach(() => {
    for (const dir of temps.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('base discovery', () => {
    test('returns empty when no .reqlan exists', () => {
        const root = tempDir();
        mkdirSync(join(root, 'src'));
        expect(discoverBases([root])).toEqual([]);
    });

    test('discovers base at workspace root', () => {
        const root = tempDir();
        markBase(root);
        const bases = discoverBases([root]);
        expect(bases).toHaveLength(1);
        expect(bases[0]!.root).toBe(resolve(root));
        expect(bases[0]!.memoryPath).toBe(join(resolve(root), APPLICATION_MEMORY_DIR));
    });

    test('discovers nested bases and excludes child files from parent ownership', () => {
        const root = tempDir();
        markBase(root);
        const child = join(root, 'packages', 'lib');
        mkdirSync(child, { recursive: true });
        markBase(child);

        const parentFile = join(root, 'a.rq');
        const childFile = join(child, 'b.rq');
        writeFileSync(parentFile, 'idea x\n');
        writeFileSync(childFile, 'idea y\n');

        const bases = discoverBases([root]);
        expect(bases).toHaveLength(2);

        const parent = bases.find(b => b.root === resolve(root))!;
        const nested = bases.find(b => b.root === resolve(child))!;
        expect(parent).toBeDefined();
        expect(nested).toBeDefined();

        const parentOwned = filesOwnedByBase(parent, [parentFile, childFile], bases);
        expect(parentOwned).toEqual([parentFile]);

        const childOwned = filesOwnedByBase(nested, [parentFile, childFile], bases);
        expect(childOwned).toEqual([childFile]);
    });

    test('baseForPath picks longest matching root', () => {
        const root = tempDir();
        markBase(root);
        const child = join(root, 'nested');
        mkdirSync(child, { recursive: true });
        markBase(child);
        const bases = discoverBases([root]);

        expect(baseForPath(bases, join(child, 'x.rq'))?.root).toBe(resolve(child));
        expect(baseForPath(bases, join(root, 'y.rq'))?.root).toBe(resolve(root));
        expect(baseForPath(bases, '/tmp/outside')).toBeUndefined();
    });

    test('selectDefaultBase prefers cwd containment', () => {
        const root = tempDir();
        markBase(root);
        const child = join(root, 'app');
        mkdirSync(child, { recursive: true });
        markBase(child);
        const bases = discoverBases([root]);
        expect(selectDefaultBase(bases, child)?.root).toBe(resolve(child));
        expect(selectDefaultBase(bases)?.root).toBe(resolve(root));
        expect(selectDefaultBase([])).toBeUndefined();
    });

    test('skips node_modules and does not treat .reqlan as a walkable base root', () => {
        const root = tempDir();
        markBase(root);
        const nm = join(root, 'node_modules', 'pkg');
        mkdirSync(nm, { recursive: true });
        markBase(nm);
        const bases = discoverBases([root]);
        expect(bases).toHaveLength(1);
        expect(bases[0]!.root).toBe(resolve(root));
    });

    test('skips venv nested bases via default rqignore', () => {
        const root = tempDir();
        markBase(root);
        const venv = join(root, 'venv', 'project');
        mkdirSync(venv, { recursive: true });
        markBase(venv);
        const bases = discoverBases([root]);
        expect(bases).toHaveLength(1);
        expect(bases[0]!.root).toBe(resolve(root));
    });

    test('toBaseDescriptor label is relative when labelRoot provided', () => {
        const root = tempDir();
        const child = join(root, 'sub');
        mkdirSync(child, { recursive: true });
        markBase(child);
        const desc = toBaseDescriptor(child, root);
        expect(desc.label).toBe('sub');
    });

    test('isPathInsideOrEqual treats Windows drive paths as case-insensitive', () => {
        expect(
            isPathInsideOrEqual(
                'c:\\Users\\tony\\reqlan\\reqlan rq\\cli\\cli_package.rq',
                'C:\\Users\\tony\\reqlan'
            )
        ).toBe(true);
        expect(isPathInsideOrEqual('C:\\Users\\tony\\reqlan', 'C:\\Users\\tony\\reqlan')).toBe(true);
        expect(isPathInsideOrEqual('C:\\Users\\tony\\other\\file.rq', 'C:\\Users\\tony\\reqlan')).toBe(false);
    });
});

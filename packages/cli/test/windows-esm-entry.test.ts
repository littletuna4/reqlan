import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { fsPathToEsmSpecifier } from '../src/esm-path.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('fsPathToEsmSpecifier', () => {
    test('converts POSIX absolute paths to file: URLs', () => {
        const specifier = fsPathToEsmSpecifier('/tmp/reqlan/out/main.js');
        expect(specifier.startsWith('file:')).toBe(true);
        expect(new URL(specifier).protocol).toBe('file:');
    });

    test('does not treat a Windows drive letter as a URL scheme', () => {
        const specifier = fsPathToEsmSpecifier('C:\\Users\\tony\\AppData\\Roaming\\npm\\node_modules\\@reqlan\\cli\\out\\main.js');
        expect(new URL(specifier).protocol).toBe('file:');
        expect(decodeURIComponent(specifier).toLowerCase()).toContain('/c:/users/tony/');
        expect(specifier).toContain('out/main.js');
    });

    test('converts Windows forward-slash drive paths to file: URLs', () => {
        const specifier = fsPathToEsmSpecifier('c:/Users/tony/reqlan/out/main.js');
        expect(new URL(specifier).protocol).toBe('file:');
        expect(decodeURIComponent(specifier).toLowerCase()).toContain('/c:/users/tony/reqlan/out/main.js');
    });
});

describe('CLI and MCP bin entries', () => {
    test('CLI bin loads the compiled entry via an ESM file URL helper', () => {
        const source = readFileSync(join(here, '../bin/cli.js'), 'utf8');
        expect(source).toContain('fsPathToEsmSpecifier');
        expect(source).toMatch(/await import\(fsPathToEsmSpecifier\(/);
        expect(source).not.toMatch(/await import\(join\(/);
    });

    test('MCP bin converts the compiled entry with pathToFileURL', () => {
        const source = readFileSync(join(here, '../../mcp/bin/mcp.js'), 'utf8');
        expect(source).toContain('pathToFileURL');
        expect(source).toMatch(/await import\(pathToFileURL\(/);
        expect(source).not.toMatch(/await import\(join\(/);
    });
});

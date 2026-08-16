/**
 * Native CLI/MCP entry must not load Langium or @reqlan/language.
 * rq:["../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../reqlan rq/core_analysis/rust_port.rq".cutover]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const nativeEntry = join(here, '../src/native/index.ts');

function isTypeOnlyClause(prefix: string, clause: string): boolean {
    if (/\btype\s*$/.test(prefix) || /^type\s/.test(clause.trim())) {
        return true;
    }
    const named = clause.match(/\{([^}]*)\}/);
    if (!named) {
        return false;
    }
    const parts = named[1]
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    return parts.length > 0 && parts.every(part => part.startsWith('type '));
}

function valueSpecifiers(source: string): string[] {
    const specifiers: string[] = [];
    const pattern =
        /(?:^|\n)(?:import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(pattern)) {
        const typeKeyword = match[1];
        const clause = match[2] ?? '';
        const specifier = match[3];
        if (!specifier || typeKeyword || isTypeOnlyClause(match[0], clause)) {
            continue;
        }
        specifiers.push(specifier);
    }
    return specifiers;
}

function resolveTs(fromFile: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) {
        return undefined;
    }
    const base = join(dirname(fromFile), specifier.replace(/\.js$/, ''));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function walkValueImports(entry: string): { files: string[]; packages: string[] } {
    const files: string[] = [];
    const packages: string[] = [];
    const queue = [entry];
    const seen = new Set<string>();
    while (queue.length > 0) {
        const file = queue.pop()!;
        if (seen.has(file)) {
            continue;
        }
        seen.add(file);
        files.push(file);
        const source = readFileSync(file, 'utf8');
        for (const specifier of valueSpecifiers(source)) {
            if (specifier.startsWith('node:')) {
                continue;
            }
            if (!specifier.startsWith('.')) {
                packages.push(specifier);
                continue;
            }
            const resolved = resolveTs(file, specifier);
            if (resolved) {
                queue.push(resolved);
            }
        }
    }
    return { files, packages };
}

describe('core engine entry', () => {
    test('package exports ./core', () => {
        const pkg = JSON.parse(
            readFileSync(join(here, '../package.json'), 'utf8')
        ) as { exports: Record<string, { default: string }> };
        expect(pkg.exports['./core']?.default).toBe('./out/native/index.js');
    });

    test('package exports ./native', () => {
        const pkg = JSON.parse(
            readFileSync(join(here, '../package.json'), 'utf8')
        ) as { exports: Record<string, { default: string }> };
        expect(pkg.exports['./native']?.default).toBe('./out/native/index.js');
    });

    test('native module graph does not value-import Langium or @reqlan/language', () => {
        const { files, packages } = walkValueImports(nativeEntry);
        expect(files.length).toBeGreaterThan(3);
        expect(packages).not.toContain('@reqlan/language');
        expect(packages).not.toContain('langium');
        expect(packages.filter(name => name === 'langium/lsp' || name.startsWith('langium/'))).toEqual(
            []
        );
        expect(files.some(file => file.endsWith('create-runtime.ts'))).toBe(false);
        expect(files.some(file => file.endsWith('workspace-index.ts'))).toBe(false);
        // barrel-page.ts is now native (no Langium) and is intentionally part of the /core graph.
        expect(files.some(file => file.endsWith('barrel-page.ts'))).toBe(true);
        for (const file of files) {
            const source = readFileSync(file, 'utf8');
            const values = valueSpecifiers(source);
            expect(values, file).not.toContain('@reqlan/language');
            expect(values, file).not.toContain('langium');
        }
    });

    test('native src tree does not contain Langium service setup', () => {
        const nativeDir = join(here, '../src/native');
        const names = readdirSync(nativeDir);
        expect(names).toContain('index.ts');
        const joined = names
            .filter(name => name.endsWith('.ts'))
            .map(name => readFileSync(join(nativeDir, name), 'utf8'))
            .join('\n');
        expect(joined).not.toContain('createReqlanServices');
        expect(joined).not.toContain('ReqlanGeneratedSharedModule');
        expect(joined).not.toContain('reqlanGeneratedSharedModule');
    });
});

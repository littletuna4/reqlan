/**
 * CLI runtime uses the core analytical engine, not Langium.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]
 * rq:["../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const cliSrc = join(here, '../src');
const repoRoot = join(here, '../../..');

function readSrc(relative: string): string {
    return readFileSync(join(cliSrc, relative), 'utf8');
}

describe('CLI/MCP native cutover wiring', () => {
    test('CLI runtime opens AnalysisApi through the core engine', () => {
        const source = readSrc('runtime.ts');
        expect(source).toMatch(/from ['"]@reqlan\/analytical\/core['"]/);
        expect(source).toContain('openAnalysisApi');
        expect(source).toContain('opened.dispose');
        expect(source).not.toContain('nativeEngineRequested');
        expect(source).not.toContain('createAnalysisRuntime');
        expect(source).not.toMatch(/from ['"]@reqlan\/analytical['"]/);
    });

    test('MCP server opens AnalysisApi through the core engine', () => {
        const source = readFileSync(join(here, '../../mcp/src/server.ts'), 'utf8');
        expect(source).toMatch(/from ['"]@reqlan\/analytical\/core['"]/);
        expect(source).toContain('openAnalysisApi');
        expect(source).toContain('opened.dispose');
        expect(source).not.toContain('createAnalysisRuntime');
        expect(source).not.toContain('NativeAnalysisApi');
        expect(source).not.toMatch(/from ['"]@reqlan\/analytical['"]/);
    });

    test('CLI commands do not statically import Langium or @reqlan/language', () => {
        const files = ['main.ts', 'runtime.ts', ...commandFiles()];
        for (const file of files) {
            const source = readSrc(file);
            expect(source, file).not.toContain('@reqlan/language');
            expect(source, file).not.toContain('from \'langium');
            expect(source, file).not.toContain('from "langium');
            expect(source, file).not.toContain('createReqlanServices');
        }
    });

    test('parse command uses native parseReqlanSource', () => {
        const source = readSrc('commands/parse.ts');
        expect(source).toContain('parseReqlanSource');
        expect(source).toContain('@reqlan/analytical/core');
    });

    test('barrel command lazy-loads the native /core barrel helper', () => {
        const source = readSrc('commands/barrel.ts');
        expect(source).toMatch(/await import\(['"]@reqlan\/analytical\/core['"]\)/);
        expect(source).not.toMatch(/from '@reqlan\/analytical['"]/);
    });

    test('search does not load the Langium language module', { timeout: 20_000 }, () => {
        const result = spawnSync(
            process.execPath,
            [join(here, '../bin/cli.js'), 'search', 'hello', '--json', '--cwd', repoRoot],
            { encoding: 'utf8', cwd: repoRoot }
        );
        const output = `${result.stdout}\n${result.stderr}`;
        expect(output).not.toMatch(/ReqlanGeneratedSharedModule/);
        expect(output).not.toMatch(/reqlanGeneratedSharedModule/);
        expect(output).not.toMatch(/reqlan-module/);
        expect(output).not.toMatch(/does not provide an export named/);
    });
});

function commandFiles(): string[] {
    return readdirSync(join(cliSrc, 'commands'))
        .filter(name => name.endsWith('.ts'))
        .map(name => `commands/${name}`);
}

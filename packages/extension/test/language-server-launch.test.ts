/**
 * rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveLanguageServerLaunch } from '../src/extension/language-server-launch.js';

describe('language server launch', () => {
    test('defaults to the rust binary over stdio', () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-lsp-launch-'));
        const extensionPath = join(root, 'packages', 'extension');
        mkdirSync(join(extensionPath, 'bin'), { recursive: true });
        const binary = join(extensionPath, 'bin', 'reqlan-lsp');
        writeFileSync(binary, '');
        const launch = resolveLanguageServerLaunch({ engine: 'rust', extensionPath });
        expect(launch).toEqual({ kind: 'rust', command: binary, transport: 'stdio' });
    });

    test('launches the release build and never a debug build', () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-lsp-dev-'));
        const extensionPath = join(root, 'packages', 'extension');
        mkdirSync(extensionPath, { recursive: true });
        for (const profile of ['debug', 'release']) {
            mkdirSync(join(root, 'crates', 'target', profile), { recursive: true });
            writeFileSync(join(root, 'crates', 'target', profile, 'reqlan-lsp'), '');
        }
        const launch = resolveLanguageServerLaunch({ engine: 'rust', extensionPath });
        expect(launch).toEqual({
            kind: 'rust',
            command: join(root, 'crates', 'target', 'release', 'reqlan-lsp'),
            transport: 'stdio'
        });
        rmSync(join(root, 'crates', 'target', 'release'), { recursive: true });
        expect(resolveLanguageServerLaunch({ engine: 'rust', extensionPath }).kind).toBe('node');
    });

    test('uses the node server when rust is missing', () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-lsp-missing-'));
        const extensionPath = join(root, 'packages', 'extension');
        mkdirSync(extensionPath, { recursive: true });
        const launch = resolveLanguageServerLaunch({ engine: 'rust', extensionPath });
        expect(launch.kind).toBe('node');
        if (launch.kind === 'node') {
            expect(launch.transport).toBe('ipc');
            expect(launch.modulePath).toContain('main.cjs');
        }
    });

    test('honours an explicit node engine', () => {
        const root = mkdtempSync(join(tmpdir(), 'reqlan-lsp-node-'));
        const extensionPath = join(root, 'packages', 'extension');
        mkdirSync(join(extensionPath, 'bin'), { recursive: true });
        writeFileSync(join(extensionPath, 'bin', 'reqlan-lsp'), '');
        const launch = resolveLanguageServerLaunch({ engine: 'node', extensionPath });
        expect(launch.kind).toBe('node');
    });
});

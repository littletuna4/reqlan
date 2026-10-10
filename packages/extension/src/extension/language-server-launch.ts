/**
 * Choose the language server process.
 * rq:["../../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

export type LanguageServerEngine = 'rust' | 'node';

export interface LanguageServerLaunchInput {
    engine: LanguageServerEngine;
    extensionPath: string;
}

export type LanguageServerLaunch =
    | { kind: 'rust'; command: string; transport: 'stdio' }
    | { kind: 'node'; modulePath: string; transport: 'ipc' };

export function resolveLanguageServerLaunch(input: LanguageServerLaunchInput): LanguageServerLaunch {
    if (input.engine !== 'node') {
        const command = findRustLanguageServer(input.extensionPath);
        if (command) {
            return { kind: 'rust', command, transport: 'stdio' };
        }
    }
    return {
        kind: 'node',
        modulePath: path.join(input.extensionPath, 'out', 'language', 'main.cjs'),
        transport: 'ipc'
    };
}

export function findRustLanguageServer(extensionPath: string): string | undefined {
    const exe = process.platform === 'win32' ? 'reqlan-lsp.exe' : 'reqlan-lsp';
    const repoRoot = path.resolve(extensionPath, '..', '..');
    const candidates = [
        path.join(extensionPath, 'bin', exe),
        path.join(extensionPath, 'bin', 'reqlan-lsp'),
        path.join(repoRoot, 'crates', 'target', 'debug', exe),
        path.join(repoRoot, 'crates', 'target', 'release', exe),
        path.join(repoRoot, 'crates', 'target', 'debug', 'reqlan-lsp'),
        path.join(repoRoot, 'crates', 'target', 'release', 'reqlan-lsp')
    ];
    return candidates.find(candidate => existsSync(candidate));
}

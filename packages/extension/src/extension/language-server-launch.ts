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

/**
 * bin/reqlan-lsp is staged per-target by scripts/package-extension-targets.mjs;
 * the crates/target/release fallback covers local cargo builds.
 */
function findRustLanguageServer(extensionPath: string): string | undefined {
    const exe = process.platform === 'win32' ? 'reqlan-lsp.exe' : 'reqlan-lsp';
    const candidates = [
        path.join(extensionPath, 'bin', exe),
        path.resolve(extensionPath, '..', '..', 'crates', 'target', 'release', exe)
    ];
    return candidates.find(candidate => existsSync(candidate));
}

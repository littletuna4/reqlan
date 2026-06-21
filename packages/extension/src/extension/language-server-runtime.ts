import { execFileSync } from 'node:child_process';

/** Langium's Chevrotain dependency groups grammar productions with Object.groupBy during LSP initialize. */
const MIN_NODE_MAJOR = 21;

/**
 * Resolves a Node executable for the Langium language server when the extension host
 * runtime lacks ES2024 builtins required by grammar validation.
 */
export function resolveLanguageServerRuntime(): string | undefined {
    const hostMajor = Number(process.versions.node.split('.')[0]);
    if (hostMajor >= MIN_NODE_MAJOR) {
        return undefined;
    }
    try {
        return execFileSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' }).trim();
    } catch {
        return undefined;
    }
}

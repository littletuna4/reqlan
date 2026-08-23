import { execFileSync } from 'node:child_process';
import { withHiddenConsole } from '../shared/hidden-exec-file.js';

/** Langium's Chevrotain dependency groups grammar productions with Object.groupBy during LSP initialize. */
const MIN_NODE_MAJOR = 21;

/**
 * Node probe used when the extension host is older than {@link MIN_NODE_MAJOR}.
 * rq:["../../../../reqlan rq/core_analysis/core.rq".consumption_silence]
 */
export const LANGUAGE_SERVER_NODE_PROBE_OPTIONS = withHiddenConsole({ encoding: 'utf8' as const });

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
        console.log('[reqlan] language-server: probing node with hidden console');
        return execFileSync('node', ['-p', 'process.execPath'], LANGUAGE_SERVER_NODE_PROBE_OPTIONS).trim();
    } catch {
        return undefined;
    }
}

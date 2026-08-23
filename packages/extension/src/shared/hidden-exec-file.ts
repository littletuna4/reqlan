import type { ExecFileOptions, ExecFileSyncOptions } from 'node:child_process';

/**
 * Force-hide a Windows console when a GUI host (Cursor / VS Code) spawns
 * a console-subsystem binary such as `git.exe` or `node.exe`.
 *
 * rq:["../../../../reqlan rq/core_analysis/core.rq".consumption_silence]
 */
export function withHiddenConsole<T extends ExecFileOptions | ExecFileSyncOptions>(
    options: T
): T & { windowsHide: true } {
    return { ...options, windowsHide: true };
}

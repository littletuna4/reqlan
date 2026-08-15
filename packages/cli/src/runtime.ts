/**
 * CLI runtime uses the core analytical engine, not Langium.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]
 * rq:["../../../reqlan rq/cli/cli_package.rq".architecture]
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openAnalysisApi, type HeadlessAnalysisApi } from '@reqlan/analytical/core';

export function resolveWorkspaceRoot(cwd?: string): string {
    const fromEnv = process.env.REQLAN_WORKSPACE?.trim();
    if (fromEnv) {
        return resolve(fromEnv);
    }
    let dir = resolve(cwd ?? process.cwd());
    for (;;) {
        if (existsSync(resolve(dir, '.git')) || existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return resolve(cwd ?? process.cwd());
        }
        dir = parent;
    }
}

export async function withAnalysisApi<T>(
    cwd: string | undefined,
    run: (api: HeadlessAnalysisApi) => Promise<T>
): Promise<T> {
    const workspaceRoot = resolveWorkspaceRoot(cwd);
    const opened = await openAnalysisApi({
        workspaceRoot,
        cwd: cwd ? resolve(cwd) : process.cwd(),
        storagePath: process.env.REQLAN_INDEX_PATH
    });
    try {
        return await run(opened.api);
    } finally {
        await opened.dispose();
    }
}

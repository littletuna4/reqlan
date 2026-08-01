import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
    activateAnalysisRuntime,
    AnalysisApi,
    createAnalysisRuntime,
    deactivateAnalysisRuntime,
    type AnalysisRuntime
} from '@reqlan/analytical';

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
    run: (api: AnalysisApi) => Promise<T>
): Promise<T> {
    const workspaceRoot = resolveWorkspaceRoot(cwd);
    const runtime: AnalysisRuntime = createAnalysisRuntime({
        workspaceRoot,
        storagePath: process.env.REQLAN_INDEX_PATH
    });
    await activateAnalysisRuntime(runtime);
    try {
        return await run(new AnalysisApi(runtime));
    } finally {
        await deactivateAnalysisRuntime(runtime);
    }
}

/**
 * Create a reqlan base by writing the `.reqlan` application-memory marker.
 * Shared by CLI `init` and other headless tools; the extension uses the same marker.
 *
 * rq:["../../../reqlan rq/extension/module/index.rq".rqignore]
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_rqignore]
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
    CONFIG_FILENAME,
    RQIGNORE_FILENAME,
    resolveApplicationMemoryPath
} from './application-memory.js';
import { toBaseDescriptor, type BaseDescriptor } from './base-discovery.js';
import { defaultRqIgnoreFileContents } from './rqignore.js';

export interface CreateBaseResult {
    base: BaseDescriptor;
    /** True when `.reqlan` did not already exist before this call. */
    created: boolean;
}

const DEFAULT_CONFIG_JSON = `${JSON.stringify({}, null, 2)}\n`;

/**
 * Ensure `<baseRoot>/.reqlan/` exists and seed `config.json` + `.rqignore` when creating a new base.
 * Idempotent: existing markers are left alone and reported as `created: false`.
 */
export async function createBase(baseRoot: string): Promise<CreateBaseResult> {
    const root = resolve(baseRoot);
    const memoryPath = resolveApplicationMemoryPath(root);
    const created = !existsSync(memoryPath);
    await mkdir(memoryPath, { recursive: true });
    if (created) {
        await writeFile(join(memoryPath, CONFIG_FILENAME), DEFAULT_CONFIG_JSON, 'utf8');
        await writeFile(join(memoryPath, RQIGNORE_FILENAME), defaultRqIgnoreFileContents(), 'utf8');
    }
    return {
        base: toBaseDescriptor(root),
        created
    };
}

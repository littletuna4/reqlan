/**
 * Create a reqlan base by writing the `.reqlan` application-memory marker.
 * The native engine seeds `config.json`, `.rqignore`, and `.gitignore`
 * (SQLite artifacts); this wrapper returns the base descriptor.
 *
 * rq:["../../../../reqlan rq/extension/module/index.rq".rqignore]
 * rq:["../../../../reqlan rq/extension/configuration.rq".configuration_rqignore]
 * rq:["../../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 */
import { resolve } from 'node:path';
import { loadNativeEngine } from '../native/load-native.js';
import { toBaseDescriptor, type BaseDescriptor } from './base-discovery.js';

export interface CreateBaseResult {
    base: BaseDescriptor;
    /** True when `.reqlan` did not already exist before this call. */
    created: boolean;
}

interface NativeCreateBaseResult {
    created: boolean;
    memoryPath: string;
}

/**
 * Ensure `<baseRoot>/.reqlan/` exists and seed `config.json`, `.rqignore`, and `.gitignore` when creating a new base.
 * Idempotent: existing markers are left alone and reported as `created: false`.
 */
export async function createBase(baseRoot: string): Promise<CreateBaseResult> {
    const root = resolve(baseRoot);
    const engine = loadNativeEngine();
    if (typeof engine.createBase !== 'function') {
        throw new Error(
            'Native createBase is missing; rebuild crates/reqlan-napi (cargo build -p reqlan-napi).'
        );
    }
    const result = engine.createBase(root) as NativeCreateBaseResult;
    return {
        base: toBaseDescriptor(root),
        created: result.created
    };
}

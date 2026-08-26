/**
 * `//rq-ignore-error` target lines via the core Rust scanner.
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import { loadNativeEngine } from './load-native.js';

/**
 * 0-based line indexes whose diagnostics `//rq-ignore-error` suppresses.
 */
export function findRqIgnoreErrorTargetLines(text: string): number[] {
    const engine = loadNativeEngine();
    if (typeof engine.findRqIgnoreErrorTargetLines !== 'function') {
        throw new Error(
            'Native findRqIgnoreErrorTargetLines is missing; rebuild crates/reqlan-napi (cargo build -p reqlan-napi).'
        );
    }
    return engine.findRqIgnoreErrorTargetLines(text);
}

/**
 * Single-file parse via the core Rust engine (no Langium).
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
 * rq:["../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { loadNativeEngine } from './load-native.js';

export interface NativeParseElement {
    type: string;
    name?: string;
}

export interface NativeParseDiagnostic {
    severity: number;
    line: number;
    character: number;
    message: string;
    text: string;
}

export interface NativeParseResult {
    ok: boolean;
    errorCount: number;
    diagnostics: NativeParseDiagnostic[];
    elements: NativeParseElement[];
}

export function parseReqlanSource(source: string): NativeParseResult {
    const engine = loadNativeEngine();
    if (typeof engine.parseReqlanSource !== 'function') {
        throw new Error(
            'Native parseReqlanSource is missing; rebuild crates/reqlan-napi (cargo build -p reqlan-napi).'
        );
    }
    return engine.parseReqlanSource(source) as NativeParseResult;
}

/**
 * Single-file parse via the core Rust engine (no Langium).
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
 * rq:["../../../../reqlan rq/cli/cli_package.rq".commands]
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

export interface NativeAlignRef {
    form: string;
    kind: string;
    label: string;
}

export interface NativeParseResult {
    ok: boolean;
    errorCount: number;
    diagnostics: NativeParseDiagnostic[];
    elements: NativeParseElement[];
    refs?: NativeAlignRef[];
    inlineCodeCount?: number;
    codeSnippetCount?: number;
}

export interface NativeAlignSnapshot {
    ok: boolean;
    elements: NativeParseElement[];
    refs: NativeAlignRef[];
    inlineCodeCount: number;
    codeSnippetCount: number;
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

/**
 * Parse snapshot used to compare Langium and `reqlan-parse` on the same source.
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".parser_align]
 */
export function parseAlignSnapshot(source: string): NativeAlignSnapshot {
    const parsed = parseReqlanSource(source);
    return {
        ok: parsed.ok,
        elements: parsed.elements,
        refs: parsed.refs ?? [],
        inlineCodeCount: parsed.inlineCodeCount ?? 0,
        codeSnippetCount: parsed.codeSnippetCount ?? 0
    };
}

/**
 * Top-level idea names in a document via the core engine — used for historical
 * (git revision) extract without loading Langium.
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
 */
export function extractIdeaNames(source: string): string[] {
    const engine = loadNativeEngine();
    if (typeof engine.extractIdeaNames !== 'function') {
        throw new Error(
            'Native extractIdeaNames is missing; rebuild crates/reqlan-napi (cargo build -p reqlan-napi).'
        );
    }
    return engine.extractIdeaNames(source);
}

export interface LocalSymbolicImportRoot {
    alias: string;
    root?: string;
}

export interface LocalSymbolicEdge {
    id: string;
    sourceId: string;
    targetId?: string;
    targetFile?: string;
    kind: string;
    label?: string;
    sourceLine?: number;
    snippet?: string;
    isResolved?: boolean;
    sourceOffsetStart?: number;
    sourceOffsetEnd?: number;
}

export interface LocalSymbolicIdea {
    id: string;
    name: string;
    kind: string;
    fileUri: string;
    lineStart: number;
    lineEnd: number;
    summary: string;
}

export interface LocalSymbolicDocument {
    fileUri: string;
    contentHash: string;
    ideas: LocalSymbolicIdea[];
    edges: LocalSymbolicEdge[];
}

/**
 * File-local outbound symbolic extract (path + source). No workspace catalog.
 * rq:["../../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 */
export function analyzeLocalSymbolic(
    fileUri: string,
    source: string,
    importRoots?: readonly LocalSymbolicImportRoot[]
): LocalSymbolicDocument {
    const engine = loadNativeEngine();
    if (typeof engine.analyzeLocalSymbolic !== 'function') {
        throw new Error(
            'Native analyzeLocalSymbolic is missing; rebuild crates/reqlan-napi (cargo build -p reqlan-napi).'
        );
    }
    const roots = importRoots?.map(root => ({
        alias: root.alias,
        ...(root.root !== undefined ? { root: root.root } : {})
    }));
    return engine.analyzeLocalSymbolic(fileUri, source, roots) as LocalSymbolicDocument;
}

/**
 * Shared TextMate grammar loader so tests do not call loadWASM twice in one worker.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".same_line_named_block_highlighting]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registry, type IGrammar, type IRawGrammar } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';

const require = createRequire(import.meta.url);
export const reqlanTextMateGrammarPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../syntaxes/reqlan.tmLanguage.json'
);

let grammarPromise: Promise<IGrammar> | undefined;

export function loadReqlanTextMateGrammar(): Promise<IGrammar> {
    if (grammarPromise === undefined) {
        grammarPromise = loadGrammar();
    }
    return grammarPromise;
}

async function loadGrammar(): Promise<IGrammar> {
    const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
    const wasm = readFileSync(wasmPath);
    await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
    const registry = new Registry({
        onigLib: Promise.resolve({
            createOnigScanner: (patterns: string[]) => new OnigScanner(patterns),
            createOnigString: (value: string) => new OnigString(value)
        }),
        loadGrammar: async (scopeName: string) => {
            if (scopeName !== 'source.reqlan') {
                return null;
            }
            return JSON.parse(readFileSync(reqlanTextMateGrammarPath, 'utf8')) as IRawGrammar;
        }
    });
    const grammar = await registry.loadGrammar('source.reqlan');
    if (!grammar) {
        throw new Error('Failed to load source.reqlan TextMate grammar');
    }
    return grammar;
}

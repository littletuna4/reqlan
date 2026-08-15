/**
 * Shared Langium corpus dump used by the golden vitest and the write script.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { parseHelper } from 'langium/test';
import type { Model } from '@reqlan/language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';

export const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const goldenPath = join(repoDir, 'crates/reqlan-index/tests/golden/langium-corpus-names.json');

export type GoldenIdea = { name: string; kind: string };
export type GoldenDump = Record<string, GoldenIdea[]>;

export function rqFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...rqFiles(path));
        } else if (entry.name.endsWith('.rq')) {
            files.push(path);
        }
    }
    return files.sort();
}

export function isCleanParse(document: {
    parseResult: { parserErrors: unknown[]; lexerErrors?: unknown[] };
}): boolean {
    return document.parseResult.parserErrors.length === 0
        && (document.parseResult.lexerErrors?.length ?? 0) === 0;
}

export async function dumpCleanLangiumCorpus(
    parse: ReturnType<typeof parseHelper<Model>>
): Promise<GoldenDump> {
    const dump: GoldenDump = {};
    for (const path of rqFiles(join(repoDir, 'reqlan rq'))) {
        const document = await parse(readFileSync(path, 'utf8'));
        if (!isCleanParse(document)) {
            continue;
        }
        const indexed = extractIndexedDocument(document);
        const rel = relative(repoDir, path).replaceAll('\\', '/');
        dump[rel] = (indexed?.ideas ?? []).map(idea => ({ name: idea.name, kind: idea.kind }));
    }
    return dump;
}

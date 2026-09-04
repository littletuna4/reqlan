/**
 * Langium extract of the frozen golden corpus must match the committed dump.
 * Production `reqlan rq/` files are not the corpus.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Model } from '@reqlan/language';
import { createReqlanServices, isIdea, isIdeaSet, isOneLinerIdea } from '@reqlan/language';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const corpusDir = join(repoDir, 'testdata/golden-corpus');
const goldenPath = join(repoDir, 'crates/reqlan-index/tests/golden/langium-corpus-names.json');

type GoldenIdea = { name: string; kind: string };

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(() => {
    const services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

function rqFiles(dir: string): string[] {
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

function langiumIdeas(model: Model): GoldenIdea[] {
    const ideas: GoldenIdea[] = [];
    for (const element of model.elements) {
        if (isIdeaSet(element)) {
            ideas.push({ name: element.name, kind: 'ideaset' });
        } else if (isOneLinerIdea(element)) {
            ideas.push({ name: element.name, kind: 'oneliner' });
        } else if (isIdea(element)) {
            ideas.push({ name: element.name, kind: 'block' });
        }
    }
    return ideas;
}

describe('Langium golden corpus', () => {
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
    test('committed dump matches live Langium extract', { timeout: 30_000 }, async () => {
        expect(existsSync(corpusDir)).toBe(true);
        const dump: Record<string, GoldenIdea[]> = {};
        const parseFailures: string[] = [];
        for (const path of rqFiles(corpusDir)) {
            const rel = relative(repoDir, path).replace(/\\/g, '/');
            const document = await parse(readFileSync(path, 'utf8'));
            const parserErrors = document.parseResult.parserErrors;
            const lexerErrors = document.parseResult.lexerErrors;
            if (parserErrors.length > 0 || lexerErrors.length > 0) {
                parseFailures.push(
                    `${rel}: ${[...lexerErrors, ...parserErrors].map(error => error.message).join('; ')}`
                );
                continue;
            }
            dump[rel] = langiumIdeas(document.parseResult.value);
        }
        expect(parseFailures).toEqual([]);
        expect(Object.keys(dump).length).toBeGreaterThan(10);

        if (process.env.UPDATE_GOLDEN === '1') {
            writeFileSync(goldenPath, `${JSON.stringify(dump, null, 2)}\n`);
        }

        const committed = JSON.parse(readFileSync(goldenPath, 'utf8')) as Record<string, GoldenIdea[]>;
        expect(dump).toEqual(committed);
    });
});

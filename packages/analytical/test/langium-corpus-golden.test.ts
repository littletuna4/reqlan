/**
 * Live Langium extract dump for the requirement corpus.
 * Rust golden tests compare against the committed JSON; this file keeps that dump honest.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from '@reqlan/language';
import { dumpCleanLangiumCorpus, goldenPath, type GoldenDump } from './langium-corpus-dump.js';

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    const services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

describe('Langium corpus golden', () => {
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]
    test('committed dump matches live Langium extract', async () => {
        const actual = await dumpCleanLangiumCorpus(parse);
        const expected = JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenDump;
        expect(actual).toEqual(expected);
    });
});

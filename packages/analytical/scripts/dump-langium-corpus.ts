/**
 * Write crates/reqlan-index/tests/golden/langium-corpus-names.json from live Langium extract.
 * Files with lexer/parser errors are omitted — those are not a fair dual-parser baseline.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from '@reqlan/language';
import { dumpCleanLangiumCorpus, goldenPath } from '../test/langium-corpus-dump.ts';

const services = createReqlanServices(EmptyFileSystem);
const parse = parseHelper<Model>(services.Reqlan);
const dump = await dumpCleanLangiumCorpus(parse);
mkdirSync(dirname(goldenPath), { recursive: true });
writeFileSync(goldenPath, `${JSON.stringify(dump, null, 2)}\n`);
process.stdout.write(`wrote ${Object.keys(dump).length} clean files to ${goldenPath}\n`);

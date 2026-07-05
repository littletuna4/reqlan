import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from 'reqlan-language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    const services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

describe('idea extraction', () => {
    // rq:["../../../reqlan rq/language/syntax.rq".block_idea]
    test('block idea body populates summary from rich text parts', async () => {
        const document = await parse(`myidea {
            It should be a good thing.
            per [simple_views]
        }`);
        const indexed = extractIndexedDocument(document);
        expect(indexed?.ideas[0]?.summary).toContain('It should be a good thing.');
        expect(indexed?.ideas[0]?.summary).toContain('[ref]');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
    test('one-liner idea body populates summary', async () => {
        const document = await parse('oneliner this is a simple idea body');
        const indexed = extractIndexedDocument(document);
        expect(indexed?.ideas[0]?.summary).toBe('this is a simple idea body');
    });
});

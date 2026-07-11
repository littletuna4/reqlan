import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from 'reqlan-language';
import { findRqIgnoreErrorTargetLines } from '../src/reqlan-ignore-error.js';

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    const services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

describe('comment reference ignore', () => {
    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    test('findRqIgnoreErrorTargetLines marks the line after the directive', () => {
        const text = s`
            keep this //rq-ignore-error
            next line
            //rq-ignore-error
            another line
        `;
        expect([...findRqIgnoreErrorTargetLines(text)].sort()).toEqual([1, 3]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    test('does not treat rq-ignore-error inside strings as a directive', () => {
        const text = 'demo { note "//rq-ignore-error" here\nbroken line }';
        expect(findRqIgnoreErrorTargetLines(text)).toEqual(new Set());
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    test('reports unresolved reference without ignore directive', async () => {
        const document = await parse(s`
            demo {
                ["a reference containing '//' that doesn't start a comment"]
            }
        `, { validation: true });

        const unresolved = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve reference')
        );
        expect(unresolved).toHaveLength(1);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    test('suppresses errors on the line after //rq-ignore-error', async () => {
        const input = s`
            demo {
                //rq-ignore-error
                ["a reference containing '//' that doesn't start a comment"]
            }
        `;
        expect([...findRqIgnoreErrorTargetLines(input)]).toEqual([2]);
        const document = await parse(input, { validation: true });

        const unresolved = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve reference')
        );
        expect(unresolved).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    test('does not suppress errors on later lines', async () => {
        const document = await parse(s`
            demo {
                //rq-ignore-error
                valid text
                [missing_idea]
            }
        `, { validation: true });

        const unresolved = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve reference')
        );
        expect(unresolved).toHaveLength(1);
        expect(unresolved[0]?.range.start.line).toBe(3);
    });
});

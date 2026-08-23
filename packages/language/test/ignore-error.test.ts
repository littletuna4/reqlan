import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmptyFileSystem } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import type { Model } from '../src/generated/ast.js';
import { createReqlanServices } from '../src/reqlan-module.js';
import { findRqIgnoreErrorTargetLines } from '../src/reqlan-ignore-error.js';

let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    const services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

describe('comment reference ignore', () => {
    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    test('language glue uses the core Rust scanner', () => {
        const source = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), '../src/reqlan-ignore-error.ts'),
            'utf8'
        );
        expect(source).toContain('@reqlan/analytical/core');
        expect(source).not.toContain('RQ_IGNORE_ERROR');
        expect(source).not.toContain('findLineCommentStart');
    });

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
                [missing_idea_reference]
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
                [missing_idea_reference]
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
    // rq:["../../../reqlan rq/language/syntax.rq".string_and_reference_apostrophes]
    test('suppresses ignore target after single-quoted URL prose and faux multiline quotes', async () => {
        const input = s`
            demo {
                e.g. a 'https://not a comment.com'
                "//also not a comment"
                """
                // not a directive inside faux quotes
                """
                //rq-ignore-error
                [missing_idea_reference]
            }
        `;
        const document = await parse(input, { validation: true });
        const unresolved = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve reference')
        );
        expect(unresolved).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/language-support/language-server-errors.rq".file_reference_errors]
    // rq:["../../../reqlan rq/language/syntax.rq".inline_code]
    test('does not report file references inside inline code', async () => {
        const document = await parse(s`
            demo {
                Exact \`["./gone-example.rq".idea]\` stays ["./gone-live.ts"]
            }
        `, { validation: true });

        const missing = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve file reference')
        );
        expect(missing).toHaveLength(1);
        expect(missing[0]?.message).toContain('./gone-live.ts');
        expect(missing.every(diagnostic => !String(diagnostic.message).includes('gone-example.rq'))).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/language-support/language-server-errors.rq".file_reference_errors]
    test('reports a missing file reference as an error', async () => {
        const document = await parse(s`
            demo {
                see ["./does-not-exist.ts"]
            }
        `, { validation: true });

        const missing = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve file reference')
        );
        expect(missing).toHaveLength(1);
        expect(missing[0]?.severity).toBe(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/language-server-errors.rq".file_reference_errors]
    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    test('suppresses missing file reference errors on the line after //rq-ignore-error', async () => {
        const document = await parse(s`
            demo {
                //rq-ignore-error
                see ["./does-not-exist.ts"]
            }
        `, { validation: true });

        const missing = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve file reference')
        );
        expect(missing).toHaveLength(0);
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

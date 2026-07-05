import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import type { Model } from 'reqlan-language';
import { createReqlanServices, isModel } from 'reqlan-language';

const exampleDir = join(dirname(fileURLToPath(import.meta.url)), '../../../example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    const doParse = parseHelper<Model>(services.Reqlan);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Validating', () => {

    // rq:["../../../reqlan rq/extension/features-syntax.rq".syntax_features]
    test('check no errors for exampleimport1.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'exampleimport1.rq'), 'utf8'));

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".duplicate_error]
    test('reports duplicate import alias in sub idea.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'sub idea.rq'), 'utf8'));

        const duplicateAliasErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("'exampleimport2' is already defined in this file.")
        );
        expect(duplicateAliasErrors).toHaveLength(1);
        expect(duplicateAliasErrors[0].range.start.line).toBe(3);
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".duplicate_error]
    test('reports duplicate when local idea shares imported idea name', async () => {
        const document = await parse(s`
            from "subreqs.rq" import myidea as myideaalias
            myidea local idea body
        `);

        const duplicateErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("'myidea' is already defined in this file.")
        );
        expect(duplicateErrors).toHaveLength(1);
        expect(duplicateErrors[0].range.start.line).toBe(1);
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".duplicate_error]
    test('reports duplicate when local idea shares unaliased import binding', async () => {
        const document = await parse(s`
            from "subreqs.rq" import myidea
            myidea local idea body
        `);

        const duplicateErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("'myidea' is already defined in this file.")
        );
        expect(duplicateErrors).toHaveLength(1);
        expect(duplicateErrors[0].range.start.line).toBe(1);
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isModel(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a 'Model'.`
        || undefined;
}

type DocumentDiagnostic = NonNullable<LangiumDocument['diagnostics']>[number];

function diagnosticToString(d: DocumentDiagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}

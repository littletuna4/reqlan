import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { NodeFileSystem } from 'langium/node';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model } from '@reqlan/language';
import { createReqlanServices, isModel } from '@reqlan/language';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const exampleDir = join(repoDir, 'example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    const doParse = parseHelper<Model>(services.Reqlan);
    parse = (input: string) => doParse(input, { validation: true });
});

afterEach(async () => {
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
        clearDocuments(services.shared, documents);
    }
});

describe('Validating', () => {

    // rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".syntax_features]
    test('check no errors for exampleimport1.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'exampleimport1.rq'), 'utf8'));

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".sensible_alias_support]
    test('reports duplicate import alias in sub idea.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'sub idea.rq'), 'utf8'));

        const duplicateAliasErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("'exampleimport2' is already defined in this file.")
        );
        expect(duplicateAliasErrors).toHaveLength(1);
        expect(duplicateAliasErrors[0].range.start.line).toBe(3);
    });

    // rq:["../../../reqlan rq/language/imports.rq".import_tokenisation]
    // rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".sensible_alias_support]
    test('allows local idea when import uses an alias', async () => {
        const document = await parse(s`
            from "subreqs.rq" import myidea as myideaalias
            myidea {
                this should not cause a conflict.
            }
        `);

        const duplicateErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("'myidea' is already defined in this file.")
        );
        expect(duplicateErrors).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/language/imports.rq".import_tokenisation]
    test('allows local idea when qualified import uses an alias', async () => {
        const document = await parse(s`
            import "subreqs.rq".features.myidea as myideaalias
            myidea local idea body
        `);

        const duplicateErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("'myidea' is already defined in this file.")
        );
        expect(duplicateErrors).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".sensible_alias_support]
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

    // rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".sensible_alias_support]
    test('reports duplicate when local idea shares import alias', async () => {
        const document = await parse(s`
            from "subreqs.rq" import myidea as sharedname
            sharedname local idea body
        `);

        const duplicateErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("'sharedname' is already defined in this file.")
        );
        expect(duplicateErrors).toHaveLength(1);
        expect(duplicateErrors[0].range.start.line).toBe(1);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".sensible_alias_support]
    // rq:["../../../reqlan rq/language/syntax.rq".idea_name]
    test('reports duplicate when local ideaset shares a local idea name', async () => {
        const document = await parse(s`
            shared {
                body
            }
            shared (
                shared
            )
        `);

        const duplicateErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("'shared' is already defined in this file.")
        );
        expect(duplicateErrors).toHaveLength(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_does_not_exist_error]
    test('reports an error when an import path file does not exist', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const importerUri = URI.parse(pathToFileURL(join(exampleDir, 'missing-import.rq')).href);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(
            'import "./does-not-exist.rq" as missing\n',
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const missingFileErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("Could not resolve import './does-not-exist.rq'.")
        );
        expect(missingFileErrors.length).toBeGreaterThanOrEqual(1);
        expect(missingFileErrors[0]?.severity).toBe(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_does_not_exist_error]
    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_folder_targets]
    test('does not report an error when an import path is an existing folder', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const importerUri = URI.parse(pathToFileURL(
            join(repoDir, 'reqlan rq/extension/module/ideas_summary/webview.rq')
        ).href);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(
            'import "../../../../packages/extension/media/webviews/ideas-summary" as ideas_summary_media\n',
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const missingFileErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve import')
        );
        expect(missingFileErrors).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_does_not_exist_error]
    test('reports an error when a from-import path file does not exist', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const importerUri = URI.parse(pathToFileURL(join(exampleDir, 'missing-from-import.rq')).href);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(
            'from "./does-not-exist.rq" import ghost\n',
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const missingFileErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("Could not resolve import './does-not-exist.rq'.")
        );
        expect(missingFileErrors.length).toBeGreaterThanOrEqual(1);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_does_not_exist_error]
    test('reports an error when an imported idea does not exist in the target file', async () => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
        const targetUri = URI.parse(pathToFileURL(join(exampleDir, 'exampleimport.rq')).href);
        const target = services.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(join(exampleDir, 'exampleimport.rq'), 'utf8'),
            targetUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(target);
        const importerUri = URI.parse(pathToFileURL(join(exampleDir, 'missing-idea-import.rq')).href);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(
            'from "./exampleimport.rq" import missing_idea\n',
            importerUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([target, document], { validation: true });

        const missingIdeaErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("Could not resolve reference to IdeaDeclaration named 'missing_idea'.")
        );
        expect(missingIdeaErrors.length).toBeGreaterThanOrEqual(1);
        expect(missingIdeaErrors[0]?.severity).toBe(1);
        const missingFileErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve import')
        );
        expect(missingFileErrors).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/language/imports.rq".import_error_recovery]
    test('reports local diagnostic for from-as mistaken import', async () => {
        services = createReqlanServices(EmptyFileSystem);
        const localParse = parseHelper<Model>(services.Reqlan);
        const document = await localParse(s`
            from "./example.rq" as example_alias
            later_idea body text
        `, { validation: true });

        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(document.parseResult.value.elements.map(element =>
            'name' in element ? element.name : element.$type
        )).toEqual(['later_idea']);
        const syntaxErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Invalid syntax: use `import "./example.rq" as example_alias`')
        );
        expect(syntaxErrors).toHaveLength(1);
        expect(syntaxErrors[0].range.start.line).toBe(0);
        const cascadeEof = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("Expecting token of type 'EOF'")
        );
        expect(cascadeEof).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/language/imports.rq".import_error_recovery]
    test('reports local diagnostic for unquoted from-import', async () => {
        services = createReqlanServices(EmptyFileSystem);
        const localParse = parseHelper<Model>(services.Reqlan);
        const document = await localParse(s`
            from example.rq import symbol1
            later_idea body text
        `, { validation: true });

        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(document.parseResult.value.elements.map(element =>
            'name' in element ? element.name : element.$type
        )).toEqual(['later_idea']);
        const syntaxErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Invalid from-import: expected a quoted path')
        );
        expect(syntaxErrors).toHaveLength(1);
        expect(syntaxErrors[0].range.start.line).toBe(0);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".no_name_idea_safe_warning]
    test('warns on top-level nameless braces without invalidating later ideas', async () => {
        services = createReqlanServices(EmptyFileSystem);
        const localParse = parseHelper<Model>(services.Reqlan);
        const document = await localParse(s`
            {
                orphan body
            }

            later_idea {
                still reachable
            }
        `, { validation: true });
        expect(checkDocumentValid(document)).toBeUndefined();
        const warnings = (document.diagnostics ?? []).filter(
            diagnostic => diagnostic.severity === 2
                && typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Nameless idea block')
        );
        expect(warnings).toHaveLength(1);
        expect(document.parseResult.value.elements.some(
            element => 'name' in element && element.name === 'later_idea'
        )).toBe(true);
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

/**
 * When the Langium AST is populated, replaced, or left unchanged.
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_algorithm]
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { DocumentState, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import { CancellationToken } from 'vscode-languageserver';
import { createReqlanServices } from '../src/reqlan-module.js';
import {
    createIncompleteParseResult
} from '../src/reqlan-parse-budget.js';
import {
    clearNeighborParseCache,
    parseNeighborDocument
} from '../src/reqlan-neighbor-parse.js';
import {
    isIdea,
    isIdeaSet,
    isModel,
    isOneLinerIdea,
    type Model
} from '../src/generated/ast.js';

describe('Langium AST lifecycle', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;
    let tempDir: string | undefined;

    beforeAll(() => {
        services = createReqlanServices(NodeFileSystem);
        parse = parseHelper<Model>(services.Reqlan);
    });

    afterEach(async () => {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray();
        if (documents.length > 0) {
            await clearDocuments(services.shared, documents);
        }
        clearNeighborParseCache();
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
            tempDir = undefined;
        }
    });

    function populateAst(text: string, fileName: string): LangiumDocument {
        const uri = URI.parse(`file:///inmemory/${fileName}`);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(text, uri);
        services.shared.workspace.LangiumDocuments.addDocument(document);
        return document;
    }

    function ideaNames(model: Model): string[] {
        const names: string[] = [];
        for (const element of model.elements) {
            if (isIdea(element) || isIdeaSet(element) || isOneLinerIdea(element)) {
                names.push(element.name);
            }
        }
        return names;
    }

    function modelOf(document: LangiumDocument): Model {
        const value = document.parseResult.value;
        if (!isModel(value)) {
            throw new Error(`expected Model AST, got ${value.$type}`);
        }
        return value;
    }

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
    test('populates the Langium AST at Parsed without DocumentBuilder', () => {
        const document = populateAst(s`
            first_idea {
                body
            }
        `, 'parsed-only.rq');
        expect(document.state).toBe(DocumentState.Parsed);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(ideaNames(modelOf(document))).toEqual(['first_idea']);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
    test('replaces the AST when this buffer text changes', async () => {
        tempDir = mkdtempSync(join(tmpdir(), 'reqlan-ast-lifecycle-'));
        const path = join(tempDir, 'life.rq');
        writeFileSync(path, 'first_idea { body }\n');
        const uri = URI.file(path);
        const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
        const firstAst = modelOf(document);
        expect(ideaNames(firstAst)).toEqual(['first_idea']);

        writeFileSync(path, 'second_idea { body }\n');
        await services.shared.workspace.LangiumDocumentFactory.update(document, CancellationToken.None);
        const secondAst = modelOf(document);
        expect(secondAst).not.toBe(firstAst);
        expect(ideaNames(secondAst)).toEqual(['second_idea']);
        expect(document.state).toBe(DocumentState.Parsed);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
    test('keeps the AST when the text is unchanged', async () => {
        tempDir = mkdtempSync(join(tmpdir(), 'reqlan-ast-lifecycle-'));
        const path = join(tempDir, 'stable.rq');
        writeFileSync(path, 'stable_idea { body }\n');
        const uri = URI.file(path);
        const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
        const firstAst = modelOf(document);

        await services.shared.workspace.LangiumDocumentFactory.update(document, CancellationToken.None);
        expect(modelOf(document)).toBe(firstAst);
        expect(ideaNames(modelOf(document))).toEqual(['stable_idea']);
        expect(document.state).toBe(DocumentState.Parsed);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
    test('linking and validation do not replace the AST', async () => {
        const document = populateAst(s`
            alpha {
                see [beta]
            }
            beta {
                body
            }
        `, 'keep-ast.rq');
        const ast = modelOf(document);
        expect(document.state).toBe(DocumentState.Parsed);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        expect(modelOf(document)).toBe(ast);
        expect(document.state).toBe(DocumentState.Validated);
        expect(ideaNames(ast)).toEqual(['alpha', 'beta']);
    });

    // rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
    test('neighbor hop does not populate a Langium AST', async () => {
        tempDir = mkdtempSync(join(tmpdir(), 'reqlan-ast-lifecycle-'));
        const libPath = join(tempDir, 'lib.rq');
        writeFileSync(libPath, 'present_idea { body }\n');
        const host = await parse(s`
            host {
                see ["./lib.rq".present_idea]
            }
        `, {
            documentUri: URI.file(join(tempDir, 'host.rq')).toString()
        });
        const parsed = parseNeighborDocument(
            URI.file(libPath),
            services.shared.workspace.LangiumDocuments,
            services.shared.workspace.FileSystemProvider
        );
        expect(parsed?.ideas.map(idea => idea.name)).toEqual(['present_idea']);
        const loaded = services.shared.workspace.LangiumDocuments.all.toArray();
        expect(loaded).toHaveLength(1);
        expect(loaded[0]?.uri.toString()).toBe(host.uri.toString());
    });

    // rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
    test('incomplete parse stores an empty model', () => {
        const result = createIncompleteParseResult(services.Reqlan.parser.LangiumParser, {
            reason: 'timeout',
            timeoutMs: 8_000
        });
        expect(isModel(result.value)).toBe(true);
        if (!isModel(result.value)) {
            return;
        }
        expect(ideaNames(result.value)).toEqual([]);
        expect(result.reqlanIncomplete?.reason).toBe('timeout');
    });
});

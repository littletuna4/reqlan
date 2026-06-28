import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, GrammarUtils, URI, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model } from 'reqlan-language';
import { createReqlanServices, isIdea, isModel, isNamespaceImport, isReferenceTarget, isWikiLink } from 'reqlan-language';

const exampleDir = join(dirname(fileURLToPath(import.meta.url)), '../../../example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

afterEach(async () => {
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
        clearDocuments(services.shared, documents);
    }
    document = undefined;
});

async function parseDocumentsTogether(filenames: string[]): Promise<LangiumDocument<Model>[]> {
    const documents: LangiumDocument<Model>[] = [];
    for (const filename of filenames) {
        const path = join(exampleDir, filename);
        const uri = URI.parse(pathToFileURL(path).href);
        const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(path, 'utf8'),
            uri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(doc);
        documents.push(doc);
    }
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: false });
    return documents;
}

describe('Linking tests', () => {

    test('resolve wikilink to idea declaration in main.rq', async () => {
        document = await parse(readFileSync(join(exampleDir, 'main.rq'), 'utf8'));
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const links = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isWikiLink)
            .map(link => link.target.idea.ref?.name ?? link.target.idea.error?.message);

        expect(checkDocumentValid(document) || links.join('\n')).toBe(s`
            myidea
            myidea
        `);
    });

    test('resolve import alias in qualified wikilink', async () => {
        const documents = await parseDocumentsTogether(['exampleimport2.rq', 'sub idea.rq']);
        document = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));

        expect(document).toBeDefined();
        if (!document) {
            return;
        }

        const aliasLink = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isWikiLink)
            .find(link => link.target.qualifier?.ref && isNamespaceImport(link.target.qualifier.ref));

        expect(aliasLink?.target.qualifier?.ref && isNamespaceImport(aliasLink.target.qualifier.ref) && aliasLink.target.qualifier.ref.alias).toBe('exampleimport2');
        expect(aliasLink?.target.idea.ref?.name).toBe('myimportableIdea');
        expect(aliasLink?.target.idea.error).toBeUndefined();
        expect(aliasLink?.target.qualifier?.error).toBeUndefined();
    });

    test('resolve import path in qualified wikilink', async () => {
        const documents = await parseDocumentsTogether(['main.rq', 'exampleimport.rq', 'sub idea.rq']);
        document = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));

        expect(document).toBeDefined();
        if (!document) {
            return;
        }

        const pathLink = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isWikiLink)
            .find(link => link.target.path?.ref && isNamespaceImport(link.target.path.ref));

        expect(pathLink?.target.path?.ref && isNamespaceImport(pathLink.target.path.ref) && pathLink.target.path.ref.path).toBe('./exampleimport.rq');
        expect(pathLink?.target.idea.ref?.name).toBe('myimportableIdea');
        expect(pathLink?.target.idea.error).toBeUndefined();
        expect(pathLink?.target.path?.error).toBeUndefined();
    });

    test('go to definition on import path opens source file', async () => {
        const documents = await parseDocumentsTogether(['exampleimport.rq', 'sub idea.rq']);
        const subDocument = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));
        const importedDocument = documents.find(entry => entry.uri.path.endsWith('exampleimport.rq'));

        expect(subDocument).toBeDefined();
        expect(importedDocument).toBeDefined();
        if (!subDocument || !importedDocument) {
            return;
        }

        const importDecl = subDocument.parseResult.value.imports.find(
            entry => isNamespaceImport(entry) && entry.path === './exampleimport.rq' && !entry.alias
        );
        expect(importDecl).toBeDefined();
        if (!importDecl) {
            return;
        }

        const pathNode = GrammarUtils.findNodeForProperty(importDecl.$cstNode, 'path');
        expect(pathNode).toBeDefined();
        if (!pathNode) {
            return;
        }

        const links = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(subDocument, {
            textDocument: { uri: subDocument.textDocument.uri },
            position: subDocument.textDocument.positionAt(pathNode.offset)
        });

        expect(links).toHaveLength(1);
        expect(links?.[0].targetUri).toBe(importedDocument.textDocument.uri);
    });

    test('go to definition on wikilink import path opens source file', async () => {
        const documents = await parseDocumentsTogether(['main.rq', 'exampleimport.rq', 'sub idea.rq']);
        const subDocument = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));
        const importedDocument = documents.find(entry => entry.uri.path.endsWith('exampleimport.rq'));

        expect(subDocument).toBeDefined();
        expect(importedDocument).toBeDefined();
        if (!subDocument || !importedDocument) {
            return;
        }

        const pathLink = [...AstUtils.streamAst(subDocument.parseResult.value)]
            .filter(isWikiLink)
            .map(link => link.target)
            .find(target => isReferenceTarget(target) && target.path?.ref);

        expect(pathLink?.path?.ref).toBeDefined();
        if (!pathLink?.path?.$refNode) {
            return;
        }

        const links = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(subDocument, {
            textDocument: { uri: subDocument.textDocument.uri },
            position: subDocument.textDocument.positionAt(pathLink.path.$refNode.offset)
        });

        expect(links).toHaveLength(1);
        expect(links?.[0].targetUri).toBe(importedDocument.textDocument.uri);
    });

    test('go to definition on wikilink idea still opens idea declaration', async () => {
        const documents = await parseDocumentsTogether(['main.rq', 'exampleimport.rq', 'sub idea.rq']);
        const subDocument = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));
        const importedDocument = documents.find(entry => entry.uri.path.endsWith('exampleimport.rq'));

        expect(subDocument).toBeDefined();
        expect(importedDocument).toBeDefined();
        if (!subDocument || !importedDocument) {
            return;
        }

        const pathLink = [...AstUtils.streamAst(subDocument.parseResult.value)]
            .filter(isWikiLink)
            .map(link => link.target)
            .find(target => isReferenceTarget(target) && target.path?.ref);

        expect(pathLink?.idea?.$refNode).toBeDefined();
        if (!pathLink?.idea?.$refNode) {
            return;
        }

        const links = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(subDocument, {
            textDocument: { uri: subDocument.textDocument.uri },
            position: subDocument.textDocument.positionAt(pathLink.idea.$refNode.offset)
        });

        expect(links).toHaveLength(1);
        expect(links?.[0].targetUri).toBe(importedDocument.textDocument.uri);
        expect(importedDocument.textDocument.getText(links![0].targetSelectionRange!)).toBe('myimportableIdea');
    });

    test('rename finds import path declaration and qualified wikilink references', async () => {
        const documents = await parseDocumentsTogether(['main.rq', 'exampleimport.rq', 'sub idea.rq']);
        document = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));

        expect(document).toBeDefined();
        if (!document) {
            return;
        }

        const importDecl = document.parseResult.value.imports.find(
            entry => isNamespaceImport(entry) && entry.path === './exampleimport.rq' && !entry.alias
        );
        expect(importDecl).toBeDefined();
        if (!importDecl) {
            return;
        }

        const references = services.Reqlan.references.References
            .findReferences(importDecl, { includeDeclaration: true })
            .toArray();
        const pathTexts = references
            .map(reference => document!.textDocument.getText(reference.segment.range))
            .filter(text => text.includes('exampleimport.rq'));
        expect(pathTexts.length).toBeGreaterThanOrEqual(2);
    });

    test('rename finds import alias declaration and qualified wikilink references', async () => {
        const documents = await parseDocumentsTogether(['exampleimport2.rq', 'sub idea.rq']);
        document = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));

        expect(document).toBeDefined();
        if (!document) {
            return;
        }

        const importDecl = document.parseResult.value.imports.find(
            entry => isNamespaceImport(entry) && entry.alias === 'exampleimport2'
        );
        expect(importDecl).toBeDefined();
        if (!importDecl) {
            return;
        }

        const references = services.Reqlan.references.References
            .findReferences(importDecl, { includeDeclaration: true })
            .toArray();
        const texts = references.map(reference => document!.textDocument.getText(reference.segment.range));
        expect(texts.filter(text => text === 'exampleimport2').length).toBeGreaterThanOrEqual(2);
    });

    test('rename finds all idea references including wikilinks', async () => {
        document = await parse(`alpha {
    see [[beta]]
}
beta {
    see [[alpha]]
}`);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const beta = [...AstUtils.streamAst(document.parseResult.value)].find(
            node => isIdea(node) && node.name === 'beta'
        );
        expect(beta && isIdea(beta)).toBe(true);
        if (!beta || !isIdea(beta)) {
            return;
        }

        const references = services.Reqlan.references.References
            .findReferences(beta, { includeDeclaration: true })
            .toArray();
        const texts = references.map(reference => document!.textDocument.getText(reference.segment.range));
        expect(texts.filter(text => text === 'beta').length).toBeGreaterThanOrEqual(2);
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

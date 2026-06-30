import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, GrammarUtils, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model } from 'reqlan-language';
import { createReqlanServices, isBracketReference, isFromImport, isIdea, isLocalReference, isModel, isNamespaceImport, isOneLinerIdea, isQualifiedReference, isWikiLink } from 'reqlan-language';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const exampleDir = join(repoDir, 'example_rq_project');

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
            .map(link => {
                const target = link.target;
                if (isQualifiedReference(target) || isLocalReference(target)) {
                    return target.idea?.ref?.name ?? target.idea?.error?.message;
                }
                return undefined;
            });

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
            .find(link => isQualifiedReference(link.target) && link.target.qualifier?.ref && isNamespaceImport(link.target.qualifier.ref));

        expect(aliasLink && isQualifiedReference(aliasLink.target) && aliasLink.target.qualifier?.ref && isNamespaceImport(aliasLink.target.qualifier.ref) && aliasLink.target.qualifier.ref.alias).toBe('exampleimport2');
        expect(aliasLink && isQualifiedReference(aliasLink.target) && aliasLink.target.idea.ref?.name).toBe('myimportableIdea');
        expect(aliasLink && isQualifiedReference(aliasLink.target) && aliasLink.target.idea.error).toBeUndefined();
        expect(aliasLink && isQualifiedReference(aliasLink.target) && aliasLink.target.qualifier?.error).toBeUndefined();
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
            .find(link => isQualifiedReference(link.target) && link.target.path?.ref && isNamespaceImport(link.target.path.ref));

        expect(pathLink && isQualifiedReference(pathLink.target) && pathLink.target.path?.ref && isNamespaceImport(pathLink.target.path.ref) && pathLink.target.path.ref.path).toBe('./exampleimport.rq');
        expect(pathLink && isQualifiedReference(pathLink.target) && pathLink.target.idea.ref?.name).toBe('myimportableIdea');
        expect(pathLink && isQualifiedReference(pathLink.target) && pathLink.target.idea.error).toBeUndefined();
        expect(pathLink && isQualifiedReference(pathLink.target) && pathLink.target.path?.error).toBeUndefined();
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
            .find(target => isQualifiedReference(target) && target.path?.ref);

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
            .find(target => isQualifiedReference(target) && target.path?.ref);

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

    test('import idea reference resolves to imported file when local idea shares name', async () => {
        const subreqs = services.shared.workspace.LangiumDocumentFactory.fromString(
            'myidea imported body',
            URI.parse('file:///tmp/subreqs.rq')
        ) as LangiumDocument<Model>;
        const consumer = services.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                from "subreqs.rq" import myidea as myideaalias
                myidea local body
            `,
            URI.parse('file:///tmp/consumer.rq')
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(subreqs);
        services.shared.workspace.LangiumDocuments.addDocument(consumer);
        await services.shared.workspace.DocumentBuilder.build([subreqs, consumer], { validation: false });

        const fromImport = consumer.parseResult.value.imports.find(isFromImport);
        const localIdea = consumer.parseResult.value.elements.find(
            element => isOneLinerIdea(element) && element.name === 'myidea'
        );

        expect(fromImport?.idea.ref && AstUtils.getDocument(fromImport.idea.ref).uri.path).toBe('/tmp/subreqs.rq');
        expect(fromImport?.idea.ref?.name).toBe('myidea');
        expect(localIdea).toBeDefined();
        expect(fromImport?.idea.ref).not.toBe(localIdea);
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

    test('resolve anonymous import in bracket reference without import statement', async () => {
        const ontologyDir = join(repoDir, 'reqlan rq/language');
        const consumer = services.shared.workspace.LangiumDocumentFactory.fromString(
            `syntax_whitespace {
                see ["./ontology.rq".attribute]
            }`,
            URI.parse(pathToFileURL(join(ontologyDir, 'consumer.rq')).href)
        ) as LangiumDocument<Model>;
        const ontology = services.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(join(ontologyDir, 'ontology.rq'), 'utf8'),
            URI.parse(pathToFileURL(join(ontologyDir, 'ontology.rq')).href)
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(ontology);
        services.shared.workspace.LangiumDocuments.addDocument(consumer);
        await services.shared.workspace.DocumentBuilder.build([ontology, consumer], { validation: false });

        const bracketRef = [...AstUtils.streamAst(consumer.parseResult.value)]
            .filter(isBracketReference)
            .find(ref => isQualifiedReference(ref.target));

        expect(bracketRef && isQualifiedReference(bracketRef.target)).toBe(true);
        if (!bracketRef || !isQualifiedReference(bracketRef.target)) {
            return;
        }
        expect(bracketRef.target.path?.ref).toBeUndefined();
        expect(bracketRef.target.idea.ref?.name).toBe('attribute');
        expect(bracketRef.target.idea.error).toBeUndefined();
        expect(AstUtils.getDocument(bracketRef.target.idea.ref!).uri.path).toContain('ontology.rq');
    });

    test('go to definition on anonymous import path opens source file', async () => {
        const ontologyDir = join(repoDir, 'reqlan rq/language');
        const consumer = services.shared.workspace.LangiumDocumentFactory.fromString(
            `demo {
                see ["./ontology.rq".attribute]
            }`,
            URI.parse(pathToFileURL(join(ontologyDir, 'consumer.rq')).href)
        ) as LangiumDocument<Model>;
        const ontology = services.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(join(ontologyDir, 'ontology.rq'), 'utf8'),
            URI.parse(pathToFileURL(join(ontologyDir, 'ontology.rq')).href)
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(ontology);
        services.shared.workspace.LangiumDocuments.addDocument(consumer);
        await services.shared.workspace.DocumentBuilder.build([ontology, consumer], { validation: false });

        const bracketRef = [...AstUtils.streamAst(consumer.parseResult.value)]
            .filter(isBracketReference)
            .find(ref => isQualifiedReference(ref.target) && ref.target.path?.$refNode);

        const pathNode = GrammarUtils.findNodeForProperty(bracketRef.target.$cstNode, 'path');
        expect(pathNode).toBeDefined();
        if (!pathNode || !isQualifiedReference(bracketRef.target)) {
            return;
        }

        const offset = pathNode.offset + 2;
        expect(offset).toBeGreaterThanOrEqual(pathNode.offset);
        expect(offset).toBeLessThan(pathNode.end);
        expect(bracketRef.target.path?.ref).toBeUndefined();

        const links = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(consumer, {
            textDocument: { uri: consumer.textDocument.uri },
            position: consumer.textDocument.positionAt(offset)
        });

        expect(links).toHaveLength(1);
        expect(links?.[0].targetUri).toBe(ontology.textDocument.uri);
    });

    test('go to definition on anonymous import idea opens idea declaration', async () => {
        const ontologyDir = join(repoDir, 'reqlan rq/language');
        const consumer = services.shared.workspace.LangiumDocumentFactory.fromString(
            `demo {
                see ["./ontology.rq".attribute]
            }`,
            URI.parse(pathToFileURL(join(ontologyDir, 'consumer.rq')).href)
        ) as LangiumDocument<Model>;
        const ontology = services.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(join(ontologyDir, 'ontology.rq'), 'utf8'),
            URI.parse(pathToFileURL(join(ontologyDir, 'ontology.rq')).href)
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(ontology);
        services.shared.workspace.LangiumDocuments.addDocument(consumer);
        await services.shared.workspace.DocumentBuilder.build([ontology, consumer], { validation: false });

        const bracketRef = [...AstUtils.streamAst(consumer.parseResult.value)]
            .filter(isBracketReference)
            .find(ref => isQualifiedReference(ref.target) && ref.target.idea?.$refNode);

        expect(bracketRef?.target.idea?.$refNode).toBeDefined();
        if (!bracketRef?.target.idea?.$refNode) {
            return;
        }

        const links = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(consumer, {
            textDocument: { uri: consumer.textDocument.uri },
            position: consumer.textDocument.positionAt(bracketRef.target.idea.$refNode.offset)
        });

        expect(links).toHaveLength(1);
        expect(links?.[0].targetUri).toBe(ontology.textDocument.uri);
        expect(ontology.textDocument.getText(links![0].targetSelectionRange!)).toBe('attribute');
    });

    test('document links resolve test file references to the matching test', async () => {
        const fileServices = createReqlanServices(NodeFileSystem);
        const featuresPath = join(repoDir, 'reqlan rq/extension/features-syntax.rq');
        const document = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(featuresPath, 'utf8'),
            URI.parse(pathToFileURL(featuresPath).href)
        ) as LangiumDocument<Model>;
        fileServices.shared.workspace.LangiumDocuments.addDocument(document);
        await fileServices.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const position = { line: 45, character: 20 };

        const links = await fileServices.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        });
        const matchingLink = links?.find(link => link.range.start.line === 45);
        expect(matchingLink?.target).toContain('validating.test.ts');
        expect(matchingLink?.target).toContain('#L44');

        const definitions = await fileServices.Reqlan.lsp.DefinitionProvider?.getDefinition(document, {
            textDocument: { uri: document.textDocument.uri },
            position
        });
        expect(definitions).toHaveLength(1);
        expect(definitions?.[0].targetUri).toContain('validating.test.ts');
        expect(definitions?.[0].targetSelectionRange?.start.line).toBe(43);
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

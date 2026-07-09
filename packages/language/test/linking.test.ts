import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, GrammarUtils, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model } from 'reqlan-language';
import type { QualifiedReference } from 'reqlan-language';
import { createReqlanServices, isBracketReference, isFromImport, isIdea, isLocalReference, isModel, isNamespaceImport, isOneLinerIdea, isQualifiedReference, isWikiLink } from 'reqlan-language';
import { classifyReferenceUri } from '../src/reqlan-file-link-resolver.js';
import { isNamespaceImportOnlyReference, resolveNamespaceImportReferenceLink } from '../src/reqlan-namespace-import-links.js';
import {
    createSourceTextDocument,
    findCommentReferencesInText,
    resolveFileUri
} from '../src/reqlan-comment-resolver.js';
import { findCommentDefinitionAtPosition } from '../src/reqlan-reference-at-position.js';
import { findTestLineInText } from '../src/reqlan-file-references.js';

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

function resolvedReferenceIdeaName(target: QualifiedReference | NonNullable<ReturnType<typeof extractLocalReference>>): string | undefined {
    if (target.idea?.ref && (isIdea(target.idea.ref) || isOneLinerIdea(target.idea.ref))) {
        return target.idea.ref.name;
    }
    if (isQualifiedReference(target) && !target.idea && target.qualifier?.ref && (isIdea(target.qualifier.ref) || isOneLinerIdea(target.qualifier.ref))) {
        return target.qualifier.ref.name;
    }
    return target.idea?.error?.message;
}

function extractLocalReference(target: unknown) {
    return isLocalReference(target) ? target : undefined;
}

describe('Linking tests', () => {

    // rq:["../../../reqlan rq/language/syntax.rq".reference_wikilink]
    test('resolve wikilink to idea declaration in main.rq', async () => {
        document = await parse(readFileSync(join(exampleDir, 'main.rq'), 'utf8'));
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const links = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isWikiLink)
            .map(link => {
                const target = link.target;
                if (isQualifiedReference(target) || isLocalReference(target)) {
                    return resolvedReferenceIdeaName(target);
                }
                return undefined;
            });

        expect(checkDocumentValid(document) || links.join('\n')).toBe(s`
            myidea
            myidea
        `);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_qualified]
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
        if (!aliasLink || !isQualifiedReference(aliasLink.target) || !aliasLink.target.idea) {
            return;
        }
        expect(aliasLink.target.idea.ref?.name).toBe('myimportableIdea');
        expect(aliasLink.target.idea.error).toBeUndefined();
        expect(aliasLink.target.qualifier?.error).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_qualified]
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
        if (!pathLink || !isQualifiedReference(pathLink.target) || !pathLink.target.idea) {
            return;
        }
        expect(pathLink.target.idea.ref?.name).toBe('myimportableIdea');
        expect(pathLink.target.idea.error).toBeUndefined();
        expect(pathLink.target.path?.error).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".syntax_features]
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

    // rq:["../../../reqlan rq/extension/features-syntax.rq".syntax_features]
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
            .find((target): target is QualifiedReference => isQualifiedReference(target) && !!target.path?.ref);

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

    // rq:["../../../reqlan rq/extension/features-syntax.rq".syntax_features]
    test('go to definition on wikilink idea still opens idea declaration', async () => {
        const documents = await parseDocumentsTogether(['main.rq', 'exampleimport.rq', 'sub idea.rq']);
        const subDocument = documents.find(entry => entry.uri.path.endsWith('sub idea.rq'));
        const importedDocument = documents.find(entry => entry.uri.path.endsWith('exampleimport.rq'));

        expect(subDocument).toBeDefined();
        expect(importedDocument).toBeDefined();
        if (!subDocument || !importedDocument) {
            return;
        }

        const ideaLink = [...AstUtils.streamAst(subDocument.parseResult.value)]
            .filter(isWikiLink)
            .map(link => link.target)
            .find((target): target is QualifiedReference => isQualifiedReference(target) && !!target.path?.ref);

        expect(ideaLink?.idea?.$refNode).toBeDefined();
        if (!ideaLink?.idea?.$refNode) {
            return;
        }

        const links = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(subDocument, {
            textDocument: { uri: subDocument.textDocument.uri },
            position: subDocument.textDocument.positionAt(ideaLink.idea.$refNode.offset)
        });

        expect(links).toHaveLength(1);
        expect(links?.[0].targetUri).toBe(importedDocument.textDocument.uri);
        expect(importedDocument.textDocument.getText(links![0].targetSelectionRange!)).toBe('myimportableIdea');
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".refactor_support]
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

    // rq:["../../../reqlan rq/extension/features-syntax.rq".refactor_support]
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

    // rq:["../../../reqlan rq/extension/features-syntax.rq".sensible_graph_resolution]
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

        expect(fromImport?.specifiers[0]?.idea.ref && AstUtils.getDocument(fromImport.specifiers[0].idea.ref).uri.path).toBe('/tmp/subreqs.rq');
        expect(fromImport?.specifiers[0]?.idea.ref?.name).toBe('myidea');
        expect(localIdea).toBeDefined();
        expect(fromImport?.specifiers[0]?.idea.ref).not.toBe(localIdea);
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".refactor_support]
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

    // rq:["../../../reqlan rq/language/syntax.rq".anonymous_imports_allowed]
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
        if (!bracketRef || !isQualifiedReference(bracketRef.target) || !bracketRef.target.idea) {
            return;
        }
        expect(bracketRef.target.path?.ref).toBeUndefined();
        expect(bracketRef.target.idea.ref?.name).toBe('attribute');
        expect(bracketRef.target.idea.error).toBeUndefined();
        expect(AstUtils.getDocument(bracketRef.target.idea.ref!).uri.path).toContain('ontology.rq');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".anonymous_imports_allowed]
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

        expect(bracketRef).toBeDefined();
        if (!bracketRef || !isQualifiedReference(bracketRef.target)) {
            return;
        }

        const pathNode = GrammarUtils.findNodeForProperty(bracketRef.target.$cstNode, 'path');
        expect(pathNode).toBeDefined();
        if (!pathNode) {
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

    // rq:["../../../reqlan rq/language/syntax.rq".anonymous_imports_allowed]
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

        expect(bracketRef).toBeDefined();
        if (!bracketRef || !isQualifiedReference(bracketRef.target) || !bracketRef.target.idea?.$refNode) {
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

    // rq:["../../../reqlan rq/extension/features-syntax.rq".file_references]
    test('document links resolve test file references to the matching test', async () => {
        const fileServices = createReqlanServices(NodeFileSystem);
        const featuresPath = join(repoDir, 'reqlan rq/extension/features-syntax.rq');
        const validatingPath = join(repoDir, 'packages/language/test/validating.test.ts');
        const testName = 'reports duplicate when local idea shares imported idea name';
        const testLine = findTestLineInText(readFileSync(validatingPath, 'utf8'), testName);
        expect(testLine).toBeDefined();

        const document = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(featuresPath, 'utf8'),
            URI.parse(pathToFileURL(featuresPath).href)
        ) as LangiumDocument<Model>;
        fileServices.shared.workspace.LangiumDocuments.addDocument(document);
        await fileServices.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const links = await fileServices.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        });
        const expectedLineFragment = `#L${testLine! + 1}`;
        const matchingLink = links?.find(link =>
            link.target?.includes('validating.test.ts') && link.target.includes(expectedLineFragment)
        );
        expect(matchingLink?.target).toContain('validating.test.ts');
        expect(matchingLink?.target).toContain(expectedLineFragment);

        const position = {
            line: matchingLink!.range.start.line,
            character: matchingLink!.range.start.character + 5
        };

        const definitions = await fileServices.Reqlan.lsp.DefinitionProvider?.getDefinition(document, {
            textDocument: { uri: document.textDocument.uri },
            position
        });
        expect(definitions).toHaveLength(1);
        expect(definitions?.[0].targetUri).toContain('validating.test.ts');
        expect(definitions?.[0].targetSelectionRange?.start.line).toBe(testLine);
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".file_references]
    test('classifyReferenceUri treats existing directories as folders', async () => {
        const fileServices = createReqlanServices(NodeFileSystem);
        const sourcePath = join(repoDir, 'reqlan rq/extension/features-syntax-highlighting.rq');
        const document = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                folder_reference {
                    see ["./module"]
                }
            `,
            URI.parse(pathToFileURL(sourcePath).href)
        ) as LangiumDocument<Model>;
        fileServices.shared.workspace.LangiumDocuments.addDocument(document);
        await fileServices.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const targetUri = resolveFileUri('./module', document);
        const resolution = classifyReferenceUri(
            targetUri,
            fileServices.shared.workspace.LangiumDocuments,
            fileServices.shared.workspace.FileSystemProvider
        );
        expect(resolution).toBe('folder');
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".file_references]
    test('folder file references resolve without reading the directory as a file', async () => {
        const fileServices = createReqlanServices(NodeFileSystem);  
        const sourcePath = join(repoDir, 'reqlan rq/extension/features-syntax-highlighting.rq');
        const document = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                folder_reference {
                    see ["./module"]
                }
            `,
            URI.parse(pathToFileURL(sourcePath).href)
        ) as LangiumDocument<Model>;
        fileServices.shared.workspace.LangiumDocuments.addDocument(document);
        await fileServices.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const position = { line: 1, character: 12 };

        const definitions = await fileServices.Reqlan.lsp.DefinitionProvider?.getDefinition(document, {
            textDocument: { uri: document.textDocument.uri },
            position
        });
        expect(definitions).toBeUndefined();

        const links = await fileServices.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        });
        expect(links?.some(link => link.target?.includes('reqlan.openFolderReference'))).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".file_references]
    test('missing file references do not produce document links', async () => {
        const fileServices = createReqlanServices(NodeFileSystem);
        const sourcePath = join(repoDir, 'reqlan rq/extension/features-syntax-highlighting.rq');
        const document = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                missing_reference {
                    see ["./does-not-exist.rq"]
                }
            `,
            URI.parse(pathToFileURL(sourcePath).href)
        ) as LangiumDocument<Model>;
        fileServices.shared.workspace.LangiumDocuments.addDocument(document);
        await fileServices.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const links = await fileServices.Reqlan.lsp.DocumentLinkProvider?.getDocumentLinks(document, {
            textDocument: { uri: document.textDocument.uri }
        });
        expect(links).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/features-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
    test('comment references in source files resolve to rq ideas', async () => {
        const demoDir = join(repoDir, 'reqlan rq/extension/features-code-comment');
        const rqPath = join(demoDir, 'functional-code-comment-references.rq');
        const jsPath = join(demoDir, 'features-code-comment.text.js');
        const fileServices = createReqlanServices(NodeFileSystem);
        const rqDoc = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(rqPath, 'utf8'),
            URI.parse(pathToFileURL(rqPath).href)
        );
        const jsDoc = createSourceTextDocument(
            pathToFileURL(jsPath).href,
            readFileSync(jsPath, 'utf8')
        );
        fileServices.shared.workspace.LangiumDocuments.addDocument(rqDoc);
        await fileServices.shared.workspace.DocumentBuilder.build([rqDoc], { validation: false });

        const refs = findCommentReferencesInText(readFileSync(jsPath, 'utf8'));
        expect(refs.length).toBeGreaterThan(0);

        const links = findCommentDefinitionAtPosition(
            jsDoc,
            refs[0]!.range.start,
            fileServices.shared.workspace.LangiumDocuments
        );
        expect(links).toHaveLength(1);
        expect(links?.[0]?.targetUri).toBe(rqDoc.textDocument.uri);
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".file_references]
    test('resolve namespace import references to files', async () => {
        const fileServices = createReqlanServices(NodeFileSystem);
        const targetPath = join(repoDir, 'packages/extension/webviews/ideas-summary/components/IndexPanel.svelte');
        const sourcePath = join(repoDir, 'reqlan rq/extension/module/webview.rq');
        const document = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                import "${targetPath.replace(/\\/g, '/')}" as IndexPanel
                demo {
                    see [IndexPanel]
                }
            `,
            URI.parse(pathToFileURL(sourcePath).href)
        ) as LangiumDocument<Model>;
        fileServices.shared.workspace.LangiumDocuments.addDocument(document);
        await fileServices.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const namespaceRef = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isBracketReference)
            .map(ref => ref.target)
            .find(target =>
                (isLocalReference(target) || isQualifiedReference(target))
                && isNamespaceImportOnlyReference(target)
            );
        expect(namespaceRef).toBeDefined();
        if (!namespaceRef) {
            return;
        }
        expect(isNamespaceImportOnlyReference(namespaceRef)).toBe(true);

        const link = resolveNamespaceImportReferenceLink(
            namespaceRef,
            fileServices.shared.workspace.LangiumDocuments,
            fileServices.shared.workspace.FileSystemProvider
        );
        expect(link?.targetUri).toContain('IndexPanel.svelte');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".anonymous_imports_allowed]
    test('does not report linking error for anonymous import path only', async () => {
        const fileServices = createReqlanServices(NodeFileSystem);
        const corePath = join(repoDir, 'site/reqs/core.rq');
        const brandPath = join(repoDir, 'reqlan rq/brand.rq');
        const core = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(corePath, 'utf8'),
            URI.parse(pathToFileURL(corePath).href)
        ) as LangiumDocument<Model>;
        const brand = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(brandPath, 'utf8'),
            URI.parse(pathToFileURL(brandPath).href)
        ) as LangiumDocument<Model>;
        fileServices.shared.workspace.LangiumDocuments.addDocument(brand);
        fileServices.shared.workspace.LangiumDocuments.addDocument(core);
        await fileServices.shared.workspace.DocumentBuilder.build([brand, core], { validation: true });

        const importPathErrors = (core.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("Could not resolve reference to Import")
        );
        expect(importPathErrors).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".anonymous_imports_allowed]
    test('does not report linking error for anonymous import path with idea', async () => {
        const ontologyDir = join(repoDir, 'reqlan rq/language');
        const fileServices = createReqlanServices(NodeFileSystem);
        const consumer = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            `syntax_whitespace {
                see ["./ontology.rq".attribute]
            }`,
            URI.parse(pathToFileURL(join(ontologyDir, 'consumer.rq')).href)
        ) as LangiumDocument<Model>;
        const ontology = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
            readFileSync(join(ontologyDir, 'ontology.rq'), 'utf8'),
            URI.parse(pathToFileURL(join(ontologyDir, 'ontology.rq')).href)
        ) as LangiumDocument<Model>;
        fileServices.shared.workspace.LangiumDocuments.addDocument(ontology);
        fileServices.shared.workspace.LangiumDocuments.addDocument(consumer);
        await fileServices.shared.workspace.DocumentBuilder.build([ontology, consumer], { validation: true });

        const importPathErrors = (consumer.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes("Could not resolve reference to Import")
        );
        expect(importPathErrors).toHaveLength(0);
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

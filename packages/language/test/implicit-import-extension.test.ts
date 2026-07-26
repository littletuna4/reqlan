import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, VirtualFileSystemProvider } from 'langium/test';
import type { Model } from 'reqlan-language';
import {
    createReqlanServices,
    createSourceTextDocument,
    findImportedDocument,
    importPathCandidates,
    isBracketReference,
    isFromImport,
    isQualifiedReference,
    isResolvableImportPath,
    resolveExistingImportUri
} from 'reqlan-language';

let services: ReturnType<typeof createReqlanServices>;

beforeEach(() => {
    services = createReqlanServices(EmptyFileSystem);
});

afterEach(() => {
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
        clearDocuments(services.shared, documents);
    }
});

function addDocument(uri: string, text: string): LangiumDocument<Model> {
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
        text,
        URI.parse(uri)
    ) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(document);
    return document;
}

async function build(...documents: LangiumDocument<Model>[]): Promise<void> {
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
}

function firstFromImport(document: LangiumDocument<Model>) {
    return document.parseResult.value.imports.find(isFromImport);
}

function bracketReferenceTargets(document: LangiumDocument<Model>) {
    return [...AstUtils.streamAst(document.parseResult.value)]
        .filter(isBracketReference)
        .map(reference => reference.target);
}

function unresolvedDiagnostics(document: LangiumDocument<Model>): unknown[] {
    return (document.diagnostics ?? []).filter(diagnostic =>
        typeof diagnostic.message === 'string'
        && diagnostic.message.includes('Could not resolve reference')
    );
}

describe('implicit import file extension', () => {

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('candidates assume .rq only when no extension is written', () => {
        expect(importPathCandidates('./target')).toEqual(['./target.rq', './target']);
        expect(importPathCandidates('@/nested/target')).toEqual(['@/nested/target.rq', '@/nested/target']);
        expect(importPathCandidates('./target.rq')).toEqual(['./target.rq']);
        expect(importPathCandidates('./notes.md')).toEqual(['./notes.md']);
        expect(importPathCandidates('../sibling')).toEqual(['../sibling.rq', '../sibling']);
        expect(importPathCandidates('./with.dot/target')).toEqual([
            './with.dot/target.rq',
            './with.dot/target'
        ]);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('candidates leave paths without a file name untouched', () => {
        expect(importPathCandidates('./nested/')).toEqual(['./nested/']);
        expect(importPathCandidates('.')).toEqual(['.']);
        expect(importPathCandidates('..')).toEqual(['..']);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('from-import without an extension resolves the imported idea', async () => {
        const target = addDocument('file:///ws/target.rq', s`
            target_idea {
                imported body
            }
        `);
        const source = addDocument('file:///ws/source.rq', s`
            from "./target" import target_idea

            consumer {
                uses [target_idea]
            }
        `);
        await build(target, source);

        expect(firstFromImport(source)?.specifiers[0]?.idea.ref?.name).toBe('target_idea');
        expect(unresolvedDiagnostics(source)).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('namespace import without an extension resolves qualified references', async () => {
        const target = addDocument('file:///ws/target.rq', s`
            target_idea {
                imported body
            }
        `);
        const source = addDocument('file:///ws/source.rq', s`
            import "./target" as target

            consumer {
                uses [target.target_idea]
            }
        `);
        await build(target, source);

        const reference = bracketReferenceTargets(source).find(isQualifiedReference);
        expect(reference?.idea?.ref?.name).toBe('target_idea');
        expect(unresolvedDiagnostics(source)).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('anonymous qualified references resolve without an extension', async () => {
        const target = addDocument('file:///ws/target.rq', s`
            target_idea {
                imported body
            }
        `);
        const source = addDocument('file:///ws/source.rq', s`
            consumer {
                uses ["./target".target_idea]
            }
        `);
        await build(target, source);

        const reference = bracketReferenceTargets(source).find(isQualifiedReference);
        expect(reference?.idea?.ref?.name).toBe('target_idea');
        expect(unresolvedDiagnostics(source)).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('an explicit non-rq extension is taken literally', async () => {
        const target = addDocument('file:///ws/notes.md.rq', s`
            note_idea {
                imported body
            }
        `);
        const source = addDocument('file:///ws/source.rq', s`
            from "./notes.md" import note_idea
        `);
        await build(target, source);

        expect(firstFromImport(source)?.specifiers[0]?.idea.ref).toBeUndefined();
        expect(unresolvedDiagnostics(source).length).toBeGreaterThan(0);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('the .rq file wins over a same-named extensionless file', () => {
        const fileSystem = new VirtualFileSystemProvider();
        fileSystem.insert('file:///ws/dual.rq', 'rq_idea { body }');
        fileSystem.insert('file:///ws/dual', 'extensionless body');
        const documents = services.shared.workspace.LangiumDocuments;
        const source = createSourceTextDocument('file:///ws/source.rq', 'consumer { body }');

        expect(resolveExistingImportUri('./dual', source, documents, fileSystem).toString())
            .toBe(URI.parse('file:///ws/dual.rq').toString());
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('an extensionless file still resolves when no .rq sibling exists', () => {
        const fileSystem = new VirtualFileSystemProvider();
        fileSystem.insert('file:///ws/plain', 'extensionless body');
        const documents = services.shared.workspace.LangiumDocuments;
        const source = createSourceTextDocument('file:///ws/source.rq', 'consumer { body }');

        expect(isResolvableImportPath('./plain', source, documents, fileSystem)).toBe(true);
        expect(resolveExistingImportUri('./plain', source, documents, fileSystem).toString())
            .toBe(URI.parse('file:///ws/plain').toString());
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('go-to-definition on an extensionless import path opens the .rq file', async () => {
        const target = addDocument('file:///ws/target.rq', s`
            target_idea {
                imported body
            }
        `);
        const source = addDocument('file:///ws/source.rq', s`
            from "./target" import target_idea
        `);
        await build(target, source);

        const definitions = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(source, {
            textDocument: { uri: source.textDocument.uri },
            position: { line: 0, character: 8 }
        });
        expect(definitions?.[0]?.targetUri).toBe(target.textDocument.uri);
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    test('import-root aliased paths also assume .rq', async () => {
        services.shared.workspace.WorkspaceManager.initialize({
            processId: null,
            capabilities: {},
            rootUri: null,
            workspaceFolders: [{ name: 'ws', uri: 'file:///ws' }]
        });
        const target = addDocument('file:///ws/shared/target.rq', s`
            target_idea {
                imported body
            }
        `);
        const source = addDocument('file:///ws/pkg/source.rq', s`
            from "@/shared/target" import target_idea
        `);
        await build(target, source);

        expect(firstFromImport(source)?.specifiers[0]?.idea.ref?.name).toBe('target_idea');
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('filesystem lookups append .rq but never accept a directory', () => {
        const fileSystem = new VirtualFileSystemProvider();
        fileSystem.insert('file:///ws/target.rq', 'target_idea { body }');
        fileSystem.insert('file:///ws/module/inner.rq', 'inner_idea { body }');
        const documents = services.shared.workspace.LangiumDocuments;
        const source = createSourceTextDocument('file:///ws/source.rq', 'consumer { body }');

        expect(isResolvableImportPath('./target', source, documents, fileSystem)).toBe(true);
        expect(isResolvableImportPath('./module', source, documents, fileSystem)).toBe(false);
        expect(isResolvableImportPath('./missing', source, documents, fileSystem)).toBe(false);
        expect(resolveExistingImportUri('./target', source, documents, fileSystem).toString())
            .toBe(URI.parse('file:///ws/target.rq').toString());
    });

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    test('unresolvable paths keep the written form as the reported target', () => {
        const fileSystem = new VirtualFileSystemProvider();
        const documents = services.shared.workspace.LangiumDocuments;
        const source = createSourceTextDocument('file:///ws/source.rq', 'consumer { body }');

        expect(findImportedDocument('./missing', source, documents)).toBeUndefined();
        expect(resolveExistingImportUri('./missing', source, documents, fileSystem).toString())
            .toBe(URI.parse('file:///ws/missing').toString());
    });
});

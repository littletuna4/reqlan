import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import type { CodeLens } from 'vscode-languageserver';
import {
    createReqlanServices,
    isBracketReference,
    isIdea,
    type Model
} from '@reqlan/language';
import {
    REQLAN_OPEN_REFERENCE_CODE_LENS_COMMAND,
    REQLAN_REFERENCE_CODE_LENS_SETTING,
    referenceCodeLensEnabled
} from '../src/reqlan-code-lens-settings.js';
import {
    buildReferenceCodeLensTooltip,
    classifyReferenceForCodeLens,
    countOutboundReferences,
    fileExtension,
    referenceCodeLensTitle
} from '../src/reqlan-reference-code-lens.js';
import { ReqlanCodeLensProvider } from '../src/reqlan-code-lens-provider.js';
import { collectInboundReferencers } from '../src/reqlan-inbound-reference-inlay-label.js';

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
    services.shared.workspace.ConfigurationProvider.updateConfiguration({ settings: {} });
});

function setReferenceCodeLensEnabled(enabled: boolean): void {
    services.shared.workspace.ConfigurationProvider.updateConfiguration({
        settings: {
            reqlan: {
                [REQLAN_REFERENCE_CODE_LENS_SETTING]: { enabled }
            }
        }
    });
}

async function getCodeLensesForDocument(doc: LangiumDocument<Model>) {
    const provider = new ReqlanCodeLensProvider(services.Reqlan);
    return provider.provideCodeLens(doc, {
        textDocument: { uri: doc.uri.toString() }
    });
}

function lensTitles(lenses: CodeLens[] | undefined): string[] {
    return (lenses ?? []).map(lens => lens.command?.title ?? '');
}

describe('Reference CodeLens', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".code_lens_reference_types]
    test('returns no lenses when the setting is disabled', async () => {
        document = await parse(s`
            target {
                body
            }

            source {
                see [target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        setReferenceCodeLensEnabled(false);

        const lenses = await getCodeLensesForDocument(document);

        expect(lenses).toEqual([]);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".code_lens_reference_types]
    test('reads the workspace toggle from configuration', () => {
        expect(referenceCodeLensEnabled(undefined)).toBe(false);
        expect(referenceCodeLensEnabled({ enabled: false })).toBe(false);
        expect(referenceCodeLensEnabled({ enabled: true })).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".code_lens_reference_types]
    test('classifies linked idea references as open idea', async () => {
        document = await parse(s`
            target {
                body
            }

            source {
                see [target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        setReferenceCodeLensEnabled(true);

        const lenses = await getCodeLensesForDocument(document);

        expect(lensTitles(lenses)).toContain('open idea');
        const ideaLens = lenses?.find(lens => lens.command?.title === 'open idea');
        expect(ideaLens?.command?.command).toBe(REQLAN_OPEN_REFERENCE_CODE_LENS_COMMAND);
        expect(ideaLens?.command?.arguments?.[0]).toMatchObject({
            kind: 'idea',
            classification: 'open idea',
            displayName: 'target',
            stats: expect.arrayContaining([expect.stringMatching(/referencer/)])
        });
        expect(ideaLens?.command?.tooltip).toMatch(/target/);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".code_lens_reference_types]
    test('formats classification titles for file kinds', () => {
        expect(fileExtension('file:///tmp/demo.rq')).toBe('rq');
        expect(fileExtension('file:///tmp/demo.ts')).toBe('ts');
        expect(referenceCodeLensTitle({
            kind: 'idea',
            declaration: { name: 'x' } as never
        })).toBe('open idea');
        expect(referenceCodeLensTitle({
            kind: 'reqlan-file',
            link: { sourceRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, targetUri: 'file:///a.rq' }
        })).toBe('open reqlan file');
        expect(referenceCodeLensTitle({
            kind: 'file',
            extension: 'ts',
            link: { sourceRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, targetUri: 'file:///a.ts' }
        })).toBe('open ts file');
        expect(referenceCodeLensTitle({
            kind: 'folder',
            link: { sourceRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, targetUri: 'file:///dir', resolution: 'folder' }
        })).toBe('open folder');
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".code_lens_reference_types]
    test('summary stats include referencer and reference counts for ideas', async () => {
        document = await parse(s`
            target {
                points to [other]
            }

            other {
                body
            }

            source {
                see [target]
            }

            another {
                also [target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const target = AstUtils.streamAst(document.parseResult.value).find(node => isIdea(node) && node.name === 'target');
        expect(target && isIdea(target)).toBe(true);
        if (!target || !isIdea(target)) {
            return;
        }

        expect(collectInboundReferencers(services.Reqlan, target)).toHaveLength(2);
        expect(countOutboundReferences(target)).toBe(1);

        const bracket = AstUtils.streamAst(document.parseResult.value).find(node => {
            if (!isBracketReference(node)) {
                return false;
            }
            const classification = classifyReferenceForCodeLens(services.Reqlan, node);
            return classification?.kind === 'idea' && classification.declaration.name === 'target';
        });
        expect(bracket).toBeTruthy();
        if (!bracket) {
            return;
        }
        const classification = classifyReferenceForCodeLens(services.Reqlan, bracket)!;
        const tooltip = buildReferenceCodeLensTooltip(services.Reqlan, classification);
        expect(tooltip).toContain('2 referencers');
        expect(tooltip).toContain('1 reference');
    });
});

describe('Reference CodeLens file targets', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".code_lens_reference_types]
    test('classifies folder and non-rq file references', async () => {
        const { NodeFileSystem } = await import('langium/node');
        const { join } = await import('node:path');
        const { pathToFileURL } = await import('node:url');
        const { URI } = await import('langium');
        const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');

        const fixturesDir = join(process.cwd(), 'test/fixtures/code-lens-targets');
        mkdirSync(fixturesDir, { recursive: true });
        mkdirSync(join(fixturesDir, 'folder'), { recursive: true });
        writeFileSync(join(fixturesDir, 'notes.ts'), 'export const x = 1;\n');
        writeFileSync(join(fixturesDir, 'folder', 'child.ts'), 'export const y = 1;\n');

        const fileServices = createReqlanServices(NodeFileSystem);
        const sourcePath = join(fixturesDir, 'source.rq');
        try {
            const doc = fileServices.shared.workspace.LangiumDocumentFactory.fromString(
                s`
                    file_targets {
                        see ["./notes.ts"]
                        and ["./folder"]
                    }
                `,
                URI.parse(pathToFileURL(sourcePath).href)
            ) as LangiumDocument<Model>;
            fileServices.shared.workspace.LangiumDocuments.addDocument(doc);
            await fileServices.shared.workspace.DocumentBuilder.build([doc], { validation: false });
            fileServices.shared.workspace.ConfigurationProvider.updateConfiguration({
                settings: {
                    reqlan: {
                        [REQLAN_REFERENCE_CODE_LENS_SETTING]: { enabled: true }
                    }
                }
            });

            const provider = new ReqlanCodeLensProvider(fileServices.Reqlan);
            const lenses = await provider.provideCodeLens(doc, {
                textDocument: { uri: doc.uri.toString() }
            });
            const titles = (lenses ?? []).map(lens => lens.command?.title ?? '');
            expect(titles).toContain('open ts file');
            expect(titles).toContain('open folder');
            const folderLens = lenses?.find(lens => lens.command?.title === 'open folder');
            expect(folderLens?.command?.arguments?.[0]).toMatchObject({
                kind: 'folder',
                classification: 'open folder',
                stats: expect.arrayContaining([expect.stringMatching(/file/)])
            });
            expect(folderLens?.command?.tooltip).toMatch(/file/);
        } finally {
            rmSync(fixturesDir, { recursive: true, force: true });
        }
    });
});

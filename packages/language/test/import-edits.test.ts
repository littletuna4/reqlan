/**
 * Helpers for import insertion text edits.
 * rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments } from 'langium/test';
import { expandToString as s } from 'langium/generate';
import type { Model } from '@reqlan/language';
import {
    buildFromImportEdit,
    createReqlanServices,
    fileBasenameAlias,
    isModel,
    relativeRqImportPath
} from '@reqlan/language';
import type { TextEdit } from 'vscode-languageserver';

let services: ReturnType<typeof createReqlanServices>;

beforeAll(() => {
    services = createReqlanServices(EmptyFileSystem);
});

afterEach(async () => {
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
        await clearDocuments(services.shared, documents);
    }
});

async function parseUri(text: string, uri: string): Promise<LangiumDocument<Model>> {
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
        text,
        URI.parse(uri)
    ) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(document);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
    return document;
}

function applyEdit(text: string, edit: TextEdit): string {
    const lines = text.split('\n');
    const offsets: number[] = [];
    let offset = 0;
    for (let index = 0; index < lines.length; index++) {
        offsets.push(offset);
        offset += lines[index]!.length + (index < lines.length - 1 ? 1 : 0);
    }
    const toOffset = (line: number, character: number): number =>
        (offsets[line] ?? text.length) + character;
    const start = toOffset(edit.range.start.line, edit.range.start.character);
    const end = toOffset(edit.range.end.line, edit.range.end.character);
    return text.slice(0, start) + edit.newText + text.slice(end);
}

describe('import edit helpers', () => {
    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
    test('builds relative import paths with leading ./', () => {
        expect(
            relativeRqImportPath(
                URI.parse('file:///workspace/app/a.rq'),
                URI.parse('file:///workspace/app/b.rq')
            )
        ).toBe('./b.rq');
        expect(
            relativeRqImportPath(
                URI.parse('file:///workspace/app/a.rq'),
                URI.parse('file:///workspace/lib/b.rq')
            )
        ).toBe('../lib/b.rq');
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
    test('derives a safe namespace alias from file basename', () => {
        expect(fileBasenameAlias('file:///tmp/my-file.rq')).toBe('my_file');
        expect(fileBasenameAlias('file:///tmp/123.rq')).toBe('_123');
    });
});

describe('buildFromImportEdit placement', () => {
    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
    test('inserts after an existing different-path from-import with a blank line', async () => {
        const text = s`
            from "./other.rq" import alpha

            consumer {
                [beta]
            }
        `;
        const document = await parseUri(text, 'file:///workspace/lib/consumer.rq');
        expect(isModel(document.parseResult.value)).toBe(true);
        const edit = buildFromImportEdit(document, './pair.rq', 'beta');
        expect(edit).toBeDefined();
        expect(applyEdit(text, edit!)).toBe(s`
            from "./other.rq" import alpha
            from "./pair.rq" import beta

            consumer {
                [beta]
            }
        `);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
    test('inserts after an existing from-import with no blank line', async () => {
        const text = 'from "./other.rq" import alpha\nconsumer {\n    [beta]\n}\n';
        const document = await parseUri(text, 'file:///workspace/lib/consumer-tight.rq');
        const edit = buildFromImportEdit(document, './pair.rq', 'beta');
        expect(edit).toBeDefined();
        expect(applyEdit(text, edit!)).toBe(
            'from "./other.rq" import alpha\nfrom "./pair.rq" import beta\nconsumer {\n    [beta]\n}\n'
        );
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
    test('inserts after an existing namespace import', async () => {
        const text = s`
            import "./other.rq" as other

            consumer {
                [beta]
            }
        `;
        const document = await parseUri(text, 'file:///workspace/lib/consumer-ns.rq');
        const edit = buildFromImportEdit(document, './pair.rq', 'beta');
        expect(edit).toBeDefined();
        expect(applyEdit(text, edit!)).toBe(s`
            import "./other.rq" as other
            from "./pair.rq" import beta

            consumer {
                [beta]
            }
        `);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
    test('inserts at the top when the file has no imports', async () => {
        const text = s`
            consumer {
                [beta]
            }
        `;
        const document = await parseUri(text, 'file:///workspace/lib/consumer-none.rq');
        const edit = buildFromImportEdit(document, './pair.rq', 'beta');
        expect(edit).toBeDefined();
        expect(applyEdit(text, edit!)).toBe(s`
            from "./pair.rq" import beta

            consumer {
                [beta]
            }
        `);
    });

    // rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_error]
    test('appends to an existing same-path from-import', async () => {
        const text = s`
            from "./pair.rq" import alpha

            consumer {
                [beta]
            }
        `;
        const document = await parseUri(text, 'file:///workspace/lib/consumer-append.rq');
        const edit = buildFromImportEdit(document, './pair.rq', 'beta');
        expect(edit).toBeDefined();
        expect(applyEdit(text, edit!)).toBe(s`
            from "./pair.rq" import alpha, beta

            consumer {
                [beta]
            }
        `);
    });
});

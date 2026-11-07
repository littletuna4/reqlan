import { describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper, clearDocuments } from 'langium/test';
import { createReqlanServices, isBracketReference, isIdea, isLocalReference, isFileReference } from '@reqlan/language';
import type { Model } from '@reqlan/language';

const services = createReqlanServices(EmptyFileSystem);
const parse = parseHelper<Model>(services.Reqlan);

describe('Quoted name bracket references', () => {
    // rq:["../../../reqlan rq/language/syntax.rq".reference_brackets]
    test('["my idea2"] resolves to quoted idea as LocalReference', async () => {
        const document = await parse(s`
            "my idea2" {
                content
            }
            other {
                refs ["my idea2"]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const ideas = [...AstUtils.streamAst(document.parseResult.value)].filter(isIdea);
        expect(ideas.map(i => i.name)).toContain('my idea2');

        const refs = [...AstUtils.streamAst(document.parseResult.value)].filter(isBracketReference);
        expect(refs).toHaveLength(1);
        const target = refs[0].target!;
        expect(isLocalReference(target)).toBe(true);
        if (isLocalReference(target)) {
            expect(target.idea?.ref?.name).toBe('my idea2');
            expect(target.idea?.error).toBeUndefined();
        }

        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);

        await clearDocuments(services.shared, [document]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_brackets]
    test('unquoted [myidea] still resolves as LocalReference', async () => {
        const document = await parse(s`
            myidea {
                content
            }
            other {
                refs [myidea]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const refs = [...AstUtils.streamAst(document.parseResult.value)].filter(isBracketReference);
        expect(refs).toHaveLength(1);
        const target = refs[0].target!;
        expect(isLocalReference(target)).toBe(true);
        if (isLocalReference(target)) {
            expect(target.idea?.ref?.name).toBe('myidea');
            expect(target.idea?.error).toBeUndefined();
        }

        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);

        await clearDocuments(services.shared, [document]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_brackets]
    test('mixed quoted and unquoted references both work', async () => {
        const document = await parse(s`
            "my idea2" {
                content
            }
            myidea {
                content
            }
            other {
                refs ["my idea2"]
                refs [myidea]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const refs = [...AstUtils.streamAst(document.parseResult.value)].filter(isBracketReference);
        expect(refs).toHaveLength(2);
        for (const ref of refs) {
            expect(isLocalReference(ref.target!)).toBe(true);
        }
        if (isLocalReference(refs[0].target!) && isLocalReference(refs[1].target!)) {
            expect(refs[0].target!.idea?.ref?.name).toBe('my idea2');
            expect(refs[1].target!.idea?.ref?.name).toBe('myidea');
        }

        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);

        await clearDocuments(services.shared, [document]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_brackets]
    test('["anidea"] resolves to self-quoted idea', async () => {
        const document = await parse(s`
            "anidea" {
                notanidea
            }
            other {
                refs ["anidea"]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const ideas = [...AstUtils.streamAst(document.parseResult.value)].filter(isIdea);
        expect(ideas.map(i => i.name)).toContain('anidea');

        const refs = [...AstUtils.streamAst(document.parseResult.value)].filter(isBracketReference);
        expect(refs).toHaveLength(1);
        const target = refs[0].target!;
        expect(isLocalReference(target)).toBe(true);
        if (isLocalReference(target)) {
            expect(target.idea?.ref?.name).toBe('anidea');
            expect(target.idea?.error).toBeUndefined();
        }

        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics).toHaveLength(0);

        await clearDocuments(services.shared, [document]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_brackets]
    test('quoted bracket ref to non-existent idea stays FileReference and reports error', async () => {
        const document = await parse(s`
            other {
                refs ["not_an_existing_idea_or_file"]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const refs = [...AstUtils.streamAst(document.parseResult.value)].filter(isBracketReference);
        expect(refs).toHaveLength(1);
        expect(isFileReference(refs[0].target!)).toBe(true);

        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics.length).toBeGreaterThan(0);
        expect(diagnostics.some(d => String(d.message).includes('Could not resolve file reference'))).toBe(true);

        await clearDocuments(services.shared, [document]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_brackets]
    test('go-to-definition on ["my idea2"] navigates to idea declaration', async () => {
        const document = await parse(s`
            "my idea2" {
                content
            }
            other {
                refs ["my idea2"]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

        const position = { line: 4, character: 10 };
        const definitions = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(document, {
            textDocument: { uri: document.textDocument.uri },
            position
        });
        expect(definitions).toBeDefined();
        expect(definitions).toHaveLength(1);
        expect(definitions![0].targetUri).toBe(document.textDocument.uri);

        await clearDocuments(services.shared, [document]);
    });
});

/**
 * Live Langium and `reqlan-parse` (napi) on the same source.
 * Grammar truth stays Langium; this snapshot is the dual-parser contract.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_align]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
 * rq:["../../../reqlan rq/language/syntax.rq".inline_code]
 * rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model, ReferenceTarget } from '@reqlan/language';
import {
    createReqlanServices,
    isBracketReference,
    isCodeSnippet,
    isFileReference,
    isFileSymbolReference,
    isFromImport,
    isInlineTextPart,
    isInvalidFromImport,
    isListItemBody,
    isLocalReference,
    isNamespaceImport,
    isNonBangInlineTextPart,
    isOneLinerBody,
    isQualifiedImport,
    isQualifiedReference,
    isRichTextPart,
    isWikiLink,
    isWildcardReference,
    unquoteReqlanString
} from '@reqlan/language';
import {
    parseAlignSnapshot,
    type NativeAlignRef,
    type NativeAlignSnapshot,
    type NativeParseElement
} from '@reqlan/analytical/core';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const corpusDir = join(repoDir, 'testdata/golden-corpus');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(() => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

function rqFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...rqFiles(path));
        } else if (entry.name.endsWith('.rq')) {
            files.push(path);
        }
    }
    return files.sort();
}

function canon(snapshot: NativeAlignSnapshot) {
    return {
        ok: snapshot.ok,
        elements: snapshot.elements.map(element => ({
            type: element.type,
            ...(element.name ? { name: element.name } : {})
        })),
        refs: [...snapshot.refs]
            .map(reference => ({
                form: reference.form,
                kind: reference.kind,
                label: reference.label
            }))
            .sort(compareRefs),
        inlineCodeCount: Number(snapshot.inlineCodeCount),
        codeSnippetCount: Number(snapshot.codeSnippetCount)
    };
}

function compareRefs(left: NativeAlignRef, right: NativeAlignRef): number {
    return `${left.form}\0${left.kind}\0${left.label}`.localeCompare(
        `${right.form}\0${right.kind}\0${right.label}`
    );
}

function langiumImport(importDecl: Model['imports'][number]): NativeParseElement {
    if (isFromImport(importDecl)) {
        return { type: 'FromImport', name: importDecl.path };
    }
    if (isNamespaceImport(importDecl)) {
        return { type: 'NamespaceImport', name: importDecl.alias ?? importDecl.path };
    }
    if (isQualifiedImport(importDecl)) {
        return { type: 'QualifiedImport', name: importDecl.idea.$refText };
    }
    if (isInvalidFromImport(importDecl)) {
        return { type: 'InvalidFromImport' };
    }
    return { type: 'Import' };
}

function langiumTopLevel(element: Model['elements'][number]): NativeParseElement {
    switch (element.$type) {
        case 'Idea':
            return { type: 'Idea', name: element.name };
        case 'IdeaSet':
            return { type: 'IdeaSet', name: element.name };
        case 'OneLinerIdea':
            return { type: 'OneLinerIdea', name: element.name };
        case 'AnonymousBlock':
            return { type: 'AnonymousBlock' };
    }
}

function isInlineCodeLiteral(text: string): boolean {
    return text.startsWith('`') && text.endsWith('`') && text.length > 2 && !text.startsWith('```');
}

/** INLINE_CODE terminals only — not BracketReference / WikiLink / MarkdownLink subtypes. */
function astInlineCode(node: unknown): string | undefined {
    if (isRichTextPart(node) && node.$type === 'RichTextPart') {
        return node.inlineCode;
    }
    if (isInlineTextPart(node) && node.$type === 'InlineTextPart') {
        return node.inlineCode;
    }
    if (isNonBangInlineTextPart(node) && node.$type === 'NonBangInlineTextPart') {
        return node.inlineCode;
    }
    return undefined;
}

function targetMeta(target: ReferenceTarget): { kind: string; label: string } {
    if (isLocalReference(target)) {
        return { kind: 'local', label: target.idea.$refText };
    }
    if (isQualifiedReference(target)) {
        const head = unquoteReqlanString(target.path?.$refText ?? target.qualifier?.$refText ?? '');
        const idea = target.idea.$refText;
        const set = target.ideaset?.$refText;
        return { kind: 'qualified', label: set ? `${head}.${set}.${idea}` : `${head}.${idea}` };
    }
    if (isFileReference(target)) {
        return { kind: 'file', label: unquoteReqlanString(target.file) };
    }
    if (isFileSymbolReference(target)) {
        return {
            kind: 'file_symbol',
            label: `${unquoteReqlanString(target.file)}.${target.symbols.join('.')}`
        };
    }
    if (isWildcardReference(target)) {
        return {
            kind: 'wildcard',
            label: `${unquoteReqlanString(target.pathPattern)}.${target.ideaPattern}`
        };
    }
    return { kind: 'unknown', label: '' };
}

function langiumSnapshot(model: Model, ok: boolean): NativeAlignSnapshot {
    const refs: NativeAlignRef[] = [];
    let inlineCodeCount = 0;
    let codeSnippetCount = 0;
    for (const node of AstUtils.streamAst(model)) {
        if (isCodeSnippet(node)) {
            codeSnippetCount += 1;
        }
        if (isBracketReference(node)) {
            refs.push({ form: 'bracket', ...targetMeta(node.target) });
        }
        if (isWikiLink(node)) {
            refs.push({ form: 'wiki', ...targetMeta(node.target) });
        }
        if (astInlineCode(node)) {
            inlineCodeCount += 1;
        }
        if (isOneLinerBody(node) || isListItemBody(node)) {
            for (const part of node.content) {
                if (typeof part === 'string' && isInlineCodeLiteral(part)) {
                    inlineCodeCount += 1;
                }
            }
        }
    }
    return {
        ok,
        elements: [...model.imports.map(langiumImport), ...model.elements.map(langiumTopLevel)],
        refs,
        inlineCodeCount,
        codeSnippetCount
    };
}

async function expectAligned(source: string, label: string): Promise<void> {
    const document = await parse(source);
    try {
        const langiumOk =
            document.parseResult.parserErrors.length === 0
            && document.parseResult.lexerErrors.length === 0;
        const rust = canon(parseAlignSnapshot(source));
        const langium = canon(langiumSnapshot(document.parseResult.value, langiumOk));
        expect(rust, `${label}: Rust parseAlignSnapshot vs Langium`).toEqual(langium);
    } finally {
        await clearDocuments(services.shared, [document]);
    }
}

const fixtures: Record<string, string> = {
    inline_code_file_example: [
        'demo {',
        '    Exact `["./file.rq".idea]` stays [real_idea]',
        '}',
        'real_idea { body }',
        ''
    ].join('\n'),
    fenced_file_example: [
        'demo {',
        '```',
        '["./missing.rq"]',
        '```',
        '    then [live]',
        '}',
        'live { body }',
        ''
    ].join('\n'),
    live_qualified_file_ref: 'see ["./syntax.rq".inline_code]\n',
    invalid_from_keeps_later: 'from not-a-string import foo\nlater_idea still here\n'
};

describe('Langium and Rust parse alignment', () => {
    test.each(Object.entries(fixtures))('%s', async (name, source) => {
        await expectAligned(source, name);
    });

    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_align]
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
    test('golden corpus matches live Langium and Rust snapshots', { timeout: 30_000 }, async () => {
        const files = rqFiles(corpusDir);
        expect(files.length).toBeGreaterThan(10);
        for (const path of files) {
            const rel = relative(repoDir, path).replace(/\\/g, '/');
            await expectAligned(readFileSync(path, 'utf8'), rel);
        }
    });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, AstUtils, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { parseHelper } from 'langium/test';
import type { Model, OneLinerIdea } from 'reqlan-language';
import { createReqlanServices, isAttribute, isBracketReference, isCodeSnippet, isFileReference, isFromImport, isBodyLine, isIdea, isModel, isOneLinerIdea, isScalarValue } from 'reqlan-language';
import { getReferencePrefixContext } from '../src/reqlan-completion-context.js';
import { isMarkdownLinkLabelPosition } from '../src/reqlan-markdown-links.js';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const exampleDir = join(repoDir, 'example_rq_project');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
});

function oneLinerText(idea: OneLinerIdea): string {
    return idea.body.content
        .filter((part): part is string => typeof part === 'string')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function bodyLineContaining(document: LangiumDocument, needle: string) {
    return bodyLinesContaining(document, needle)[0];
}

function bodyLinesContaining(document: LangiumDocument, needle: string) {
    return [...AstUtils.streamAst(document.parseResult.value)]
        .filter(isBodyLine)
        .filter(line => !needle || line.$cstNode?.text?.includes(needle));
}

describe('Parsing tests', () => {

    // rq:["../../../reqlan rq/language/syntax.rq".file_layout]
    test('parse syntax.rq', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/language/syntax.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".lists]
    test('keeps inline parentheses in body prose as text', async () => {
        const document = await parse(`technology {
    continuous ("live") physics.
    the controller (pixelRatio 1, no WebGL) so webviews work.
    sources (and contributions), not the whole model.
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements
            .filter(isIdea)
            .find(candidate => candidate.name === 'technology');
        expect(idea).toBeDefined();
        expect(idea!.elements.every(element => element.$type === 'BodyLine')).toBe(true);
        const bodyText = idea!.elements
            .filter(isBodyLine)
            .map(line => line.$cstNode?.text ?? '')
            .join('\n');
        expect(bodyText).toContain('("live")');
        expect(bodyText).toContain('(pixelRatio 1, no WebGL)');
        expect(bodyText).toContain('sources (and contributions)');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".round_brackets]
    test('keeps inline braces in body prose as text', async () => {
        const document = await parse(`reframe_animation {
    Every subsequent reframe animates using cytoscape.animate({ fit, easing: 'ease-out-cubic' }).
    Callers may pass \`reframeToViewport({ animate: false })\` to force an instant reframe.
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements
            .filter(isIdea)
            .find(candidate => candidate.name === 'reframe_animation');
        expect(idea).toBeDefined();
        const bodyText = idea!.elements
            .filter(isBodyLine)
            .map(line => line.$cstNode?.text ?? '')
            .join('\n');
        expect(bodyText).toContain("animate({ fit, easing: 'ease-out-cubic' })");
        expect(bodyText).toContain('reframeToViewport({ animate: false })');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".round_brackets]
    test('parse extension graph.rq library', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/extension/library/graph.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.elements.some(
            element => isIdea(element) && element.name === 'graph_library'
        )).toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_wikilink]
    test('keeps pipe characters in body prose as text', async () => {
        const document = await parse(`context_focus {
    kind: idea | file | selection | none.
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements
            .filter(isIdea)
            .find(candidate => candidate.name === 'context_focus');
        expect(idea).toBeDefined();
        const bodyText = idea!.elements
            .filter(isBodyLine)
            .map(line => line.$cstNode?.text ?? '')
            .join('\n');
        expect(bodyText).toContain('idea | file | selection | none');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_wikilink]
    test('parse extension context-scope.rq module', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/extension/module/context-scope.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.elements.some(
            element => isIdea(element) && element.name === 'context_scope'
        )).toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
    test('parse example main.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'main.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const ideas = document.parseResult.value.elements.filter(isIdea);
        expect(ideas.map(idea => idea.name)).toEqual(['myidea', 'my idea2']);
        const oneLiners = document.parseResult.value.elements.filter(isOneLinerIdea);
        expect(oneLiners.map(idea => idea.name)).toEqual([
            'my_unbracketed_one_liner_idea',
            'my_second_idea',
            'a_simple_idea'
        ]);
        expect(oneLinerText(oneLiners[0]!)).toBe('ideas should support one liners');
        expect(oneLinerText(oneLiners[1]!)).toBe('this is a blob of text');
    });

    // rq:["../../../reqlan rq/extension/features-imports.rq".from_import_syntax]
    test('parse from import with multiple symbols', async () => {
        const document = await parse('from "./example.rq" import symbol1, symbol2, symbol3');
        expect(checkDocumentValid(document)).toBeUndefined();
        const fromImport = document.parseResult.value.imports.find(isFromImport);
        expect(fromImport?.path).toBe('./example.rq');
        expect(fromImport?.specifiers.map(specifier => specifier.idea.$refText)).toEqual([
            'symbol1',
            'symbol2',
            'symbol3'
        ]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".string_and_reference_apostrophes]
    test('parse single-quoted import paths and idea names', async () => {
        const document = await parse(`from './example.rq' import symbol1
import './ontology.rq' as ontology
'my spaced idea' body text
demo {
    see ['./other.rq'] and ['../file.py']
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const fromImport = document.parseResult.value.imports.find(isFromImport);
        expect(fromImport?.path).toBe('./example.rq');
        const oneLiner = document.parseResult.value.elements.find(isOneLinerIdea);
        expect(oneLiner?.name).toBe('my spaced idea');
        const bracketReferences = [...AstUtils.streamAst(document.parseResult.value)].filter(isBracketReference);
        expect(bracketReferences).toHaveLength(2);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".import_from]
    test('parse example sub idea.rq', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'sub idea.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.imports).toHaveLength(5);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
    test('parse ontology.rq one-liner ideas', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/language/ontology.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiners = document.parseResult.value.elements.filter(isOneLinerIdea);
        expect(oneLiners.map(idea => idea.name)).toEqual([
            'idea',
            'ideaset',
            'file',
            'keyword',
            'import_statement',
            'reference',
            'referenced_files',
            'cartographic_map',
            'extension',
            'grammar_rule',
            'attribute',
            'attribute_body',
            'idea_name'
        ]);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
    test('parse one-liner ideas', async () => {
        const document = await parse(`my_unbracketed_one_liner_idea ideas should support one liners
my_second_idea this is a blob of text`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiners = document.parseResult.value.elements.filter(isOneLinerIdea);
        expect(oneLiners.map(idea => idea.name)).toEqual([
            'my_unbracketed_one_liner_idea',
            'my_second_idea'
        ]);
        expect(oneLinerText(oneLiners[0]!)).toBe('ideas should support one liners');
        expect(oneLinerText(oneLiners[1]!)).toBe('this is a blob of text');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
    test('one-liner body does not continue on the next line', async () => {
        const document = await parse(`first_idea line one
continued prose belongs to a new declaration
second_idea line two`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiners = document.parseResult.value.elements.filter(isOneLinerIdea);
        expect(oneLiners.map(idea => idea.name)).toEqual([
            'first_idea',
            'continued',
            'second_idea'
        ]);
        expect(oneLinerText(oneLiners[0]!)).toBe('line one');
        expect(oneLinerText(oneLiners[2]!)).toBe('line two');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".block_idea]
    test('parse inline idea', async () => {
        const document = await parse(`myidea {
            It should be a good thing.
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements[0];
        expect(isIdea(idea) && idea.name).toBe('myidea');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".import_from]
    test('parses from-import example line inside an attribute block value', async () => {
        const document = await parse(`import_from {
    From-import syntax uses from, a quoted path, import, and an idea name.
    From-import may include an alias using as.

    @example {
        from "example.rq" import idea
    }
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".keywords]
    test('parse import keywords in idea body text', async () => {
        const document = await parse(readFileSync(join(exampleDir, 'exampleimport2.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".keywords]
    test('parse body text containing from import as words', async () => {
        const document = await parse(`demo {
            copy from import as needed.
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_file]
    test('parse file references in a reqfile.rq', async () => {
        const document = await parse(readFileSync(
            join(exampleDir, 'a source folder/a reqfile.rq'),
            'utf8'
        ));
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
    test('parse code snippet in block idea', async () => {
        const document = await parse(`demo {
            Example usage:
            \`\`\`python
            print("hello")
            \`\`\`
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
    test('parse fenced code block in attribute value', async () => {
        const document = await parse(`demo {
    @example {
        \`\`\`python
        print("hello")
        \`\`\`
    }
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const attribute = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isAttribute)
            .find(candidate => candidate.name === 'example');
        const snippet = attribute?.value
            && [...AstUtils.streamAst(attribute.value)].find(isCodeSnippet);
        expect(snippet && 'raw' in snippet && snippet.raw).toContain('print("hello")');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
    test('treats fenced rq example as opaque text', async () => {
        const document = await parse(`demo {
    @example {
        \`\`\`rq
        from "example.rq" import idea
        @status pending
        \`\`\`
    }
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".lists]
    test('parse list items as one-liners and anonymous blocks', async () => {
        const document = await parse(`demo {
            @tags (
                todo
                highpriority
            )
            @plan {
                steps (
                    - do the thing
                    - do the other thing
                )
            }
            @refs (
                { see [[beta]] }
            )
        }
        beta {
            target
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/development/core.rq".testing]
    test('parse file references in list items', async () => {
        const document = await parse(`demo {
            @tests (
                ["../../packages/language/test/validating.test.ts:reports duplicate when local idea shares imported idea name"]
            )
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const listItem = [...AstUtils.streamAst(document.parseResult.value)]
            .find(node => node.$type === 'OneLinerListItem');
        expect(listItem).toBeDefined();
        const fileReferences = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isFileReference);
        const bracketReferences = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isBracketReference);
        expect(bracketReferences).toHaveLength(1);
        const target = bracketReferences[0]?.target;
        expect(
            (target?.$type === 'FileReference' && target.file.includes('validating.test.ts'))
            || (target?.$type === 'QualifiedReference' && target.path?.$refText?.includes('validating.test.ts'))
        ).toBe(true);
        expect(
            fileReferences[0]?.file?.includes('validating.test.ts')
            ?? target?.$type === 'QualifiedReference'
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_brackets]
    test('parse idea.attribute and ideaset references', async () => {
        const document = await parse(`demo {
            see [my_ideaset] and [myidea.status]
        }
        my_ideaset (
            myidea
        )
        myidea {
            body text
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".lists]
    test('parse named block list items and nested lists in idea bodies', async () => {
        const document = await parse(`demo {
            @subreqs (
                duplicate_error {
                    should be raised if the idea has the same name.
                    @tests (
                        ["../../packages/language/test/validating.test.ts:reports duplicate"]
                    )
                }
            )
        }`);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('keeps naked quoted phrases in block body text', async () => {
        const document = await parse(`manual_reframe {
    - "Fit to view" control in ["../../../packages/extension/webviews/ideas-summary/components/GraphControls.svelte"] dispatches.
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const bodyLine = [...AstUtils.streamAst(document.parseResult.value)].find(isBodyLine);
        expect(bodyLine?.$cstNode?.text).toContain('"Fit to view"');
        const bracketReferences = [...AstUtils.streamAst(document.parseResult.value)].filter(isBracketReference);
        expect(bracketReferences).toHaveLength(1);
        const target = bracketReferences[0]?.target;
        expect(target?.$type === 'FileReference' || target?.$type === 'QualifiedReference').toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('keeps naked quoted phrases in attribute scalar values', async () => {
        const document = await parse(`demo {
    @plan use "Fit to view" when the graph is off-screen
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const attribute = [...AstUtils.streamAst(document.parseResult.value)].find(isAttribute);
        expect(attribute?.name).toBe('plan');
        expect(isScalarValue(attribute?.value)).toBe(true);
        expect(attribute?.value?.$cstNode?.text).toContain('"Fit to view"');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('keeps single-quoted naked phrases in block body text', async () => {
        const document = await parse(`demo {
    click 'Fit to view' to reframe.
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const bodyLine = bodyLineContaining(document, 'Fit to view');
        expect(bodyLine?.$cstNode?.text).toContain("'Fit to view'");
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('keeps naked quoted phrases in one-liner body after the idea name', async () => {
        const document = await parse(`demo mention "Fit to view" in passing`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiner = document.parseResult.value.elements.find(isOneLinerIdea);
        expect(oneLiner?.name).toBe('demo');
        expect(oneLiner?.$cstNode?.text).toContain('"Fit to view"');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('keeps naked quoted phrases in list items', async () => {
        const document = await parse(`demo {
    @notes (
        "Fit to view" is the manual control label
    )
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const listItemLine = [...AstUtils.streamAst(document.parseResult.value)]
            .find(node => node.$type === 'OneLinerListItem');
        expect(listItemLine?.$cstNode?.text).toContain('"Fit to view"');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('keeps naked quotes alongside bracket references on one line', async () => {
        const document = await parse(`auto_reframe {
    without requiring the user to click "Fit to view".
    - "Fit to view" in ["../../../packages/extension/webviews/activity-bar/components/MiniGraphCanvas.svelte"] calls reframe.
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const lines = bodyLinesContaining(document, 'Fit to view');
        expect(lines).toHaveLength(2);
        for (const line of lines) {
            expect(line.$cstNode?.text).toMatch(/"Fit to view"/);
        }
        expect([...AstUtils.streamAst(document.parseResult.value)].filter(isBracketReference)).toHaveLength(1);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('does not treat naked quoted path-like prose as an import reference', async () => {
        const document = await parse(`demo {
    see "./not-an-import.rq" mentioned in prose only
}`, { validation: true });
        expect(checkDocumentValid(document)).toBeUndefined();
        const importErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve reference to Import')
        );
        expect(importErrors).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('still parses top-level quoted idea names as string literals', async () => {
        const document = await parse(`"my spaced idea" body mentions "Fit to view"`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiner = document.parseResult.value.elements.find(isOneLinerIdea);
        expect(oneLiner?.name).toBe('my spaced idea');
        expect(oneLiner?.$cstNode?.text).toContain('"Fit to view"');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('parses reframe requirement snippets with naked quoted UI labels', async () => {
        const document = await parse(`manual_reframe {
    Users can explicitly reframe the viewport when pan/zoom has moved the graph off-screen or they want to see the whole neighbourhood again.
    - "Fit to view" control in ["../../../packages/extension/webviews/ideas-summary/components/GraphControls.svelte"] dispatches to GraphView → GraphCyController.reframeToViewport().
    - "Fit to view" control in ["../../../packages/extension/webviews/activity-bar/components/MiniGraphCanvas.svelte"] calls the same API on the mini-graph controller.
    Every graph surface that mounts GraphCyController should expose this control.
}

auto_reframe {
    The graph should automatically fit to the viewport when the loaded node set changes — without requiring the user to click "Fit to view".
    Does not trigger for metadata-only updates on the same node ids (label, colour, isCenter flag, etc.) — those keep the user's current pan/zoom.
}`, { validation: true });
        expect(checkDocumentValid(document)).toBeUndefined();
        const manual = document.parseResult.value.elements.find(
            element => isIdea(element) && element.name === 'manual_reframe'
        );
        const auto = document.parseResult.value.elements.find(
            element => isIdea(element) && element.name === 'auto_reframe'
        );
        expect(isIdea(manual) && manual.elements.some(
            element => element.$type === 'BodyLine' && element.$cstNode?.text?.includes('"Fit to view"')
        )).toBe(true);
        expect(isIdea(auto) && auto.elements.some(
            element => element.$type === 'BodyLine' && element.$cstNode?.text?.includes('"Fit to view"')
        )).toBe(true);
        const nakedImportErrors = (document.diagnostics ?? []).filter(
            diagnostic => typeof diagnostic.message === 'string'
                && diagnostic.message.includes('Could not resolve reference to Import')
                && diagnostic.message.includes('Fit to view')
        );
        expect(nakedImportErrors).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".naked_strings_in_body]
    test('parses self-contained ideas with apostrophe contractions in body prose', async () => {
        const document = await parse(`my_one_line_idea_with_appostrophe there's nothing wrong with this idea

my_multi_line_idea_with_appostrophe {
 there's nothing wrong with this idea either.
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.elements).toHaveLength(2);

        const oneLiner = document.parseResult.value.elements.find(isOneLinerIdea);
        expect(oneLiner?.name).toBe('my_one_line_idea_with_appostrophe');
        expect(oneLinerText(oneLiner!)).toBe("there's nothing wrong with this idea");

        const block = document.parseResult.value.elements.find(
            element => isIdea(element) && element.name === 'my_multi_line_idea_with_appostrophe'
        );
        expect(isIdea(block)).toBe(true);
        const bodyLine = bodyLineContaining(document, "there's");
        expect(bodyLine?.$cstNode?.text).toBe("there's nothing wrong with this idea either.");
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".syntax_features]
    test('parse features-syntax.rq', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/extension/features-syntax.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        expect(document.parseResult.value.elements.map(element => element.name)).toContain('sensible_alias_support');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".markdown_links]
    test('parse markdown links without treating label as a reference', async () => {
        const document = await parse(`demo see [the label](path/here) and [myidea] refs
myidea {
    body
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiner = document.parseResult.value.elements.find(isOneLinerIdea);
        const markdownLink = oneLiner?.body.content.find(part => typeof part !== 'string' && part.$type === 'MarkdownLink');
        expect(markdownLink && 'raw' in markdownLink && markdownLink.raw).toBe('[the label](path/here)');
        const bracketReferences = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isBracketReference);
        expect(bracketReferences).toHaveLength(1);
        const target = bracketReferences[0]?.target;
        expect(
            target?.$type === 'LocalReference'
            || (target?.$type === 'QualifiedReference' && target.qualifier?.$refText === 'myidea')
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/language/syntax.rq".markdown_links]
    test('parse docs.rq markdown folder link', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/docs/docs.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const oneLiner = document.parseResult.value.elements.find(isOneLinerIdea);
        const markdownLink = oneLiner?.body.content.find(part => typeof part !== 'string' && part.$type === 'MarkdownLink');
        expect(markdownLink && 'raw' in markdownLink && markdownLink.raw).toBe(
            '[the reqlan rq folder of this repo](../../reqlan rq)'
        );
    });

    // rq:["../../../reqlan rq/language/syntax.rq".markdown_links]
    test('markdown link labels are not treated as reference prefix context', async () => {
        const services = createReqlanServices(EmptyFileSystem);
        const parse = parseHelper<Model>(services.Reqlan);
        const document = await parse(`demo { see [label](target) }
label { body }`);
        const labelOffset = document.textDocument.getText().indexOf('label');
        const position = document.textDocument.positionAt(labelOffset);
        expect(getReferencePrefixContext(document, position)).toBeUndefined();
        expect(isMarkdownLinkLabelPosition(document, position)).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/module/graphical_graph.rq".graphical_graph]
    test('parse bare numbers in body text', async () => {
        const document = await parse(s`
            graphical_graph {
                An "Indirect references" toggle expands neighbourhood depth from 1 to 2 hops.
            }
        `);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(checkDocumentValid(document)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/language/syntax.rq".attribute_forms]
    test('parses valued attributes without a colon', async () => {
        const document = await parse(`demo {
    @status pending
    @plan use "Fit to view" when needed
    @tags (
        todo
        highpriority
    )
    @notes {
        step one
        step two
    }
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const attributes = [...AstUtils.streamAst(document.parseResult.value)]
            .filter(isAttribute);
        expect(attributes.map(attribute => attribute.name)).toEqual([
            'status',
            'plan',
            'tags',
            'notes'
        ]);
        const status = attributes.find(attribute => attribute.name === 'status');
        expect(isScalarValue(status?.value)).toBe(true);
        expect(status?.value?.$cstNode?.text).toBe('pending');
        const plan = attributes.find(attribute => attribute.name === 'plan');
        expect(plan?.value?.$cstNode?.text).toContain('"Fit to view"');
        expect(attributes.find(attribute => attribute.name === 'tags')?.value?.$type).toBe('ListValue');
        expect(attributes.find(attribute => attribute.name === 'notes')?.value?.$type).toBe('BlockValue');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".round_brackets]
    test('parses inline comma-separated attribute list values', async () => {
        const document = await parse(`context_scope_v2 {
    @status in-progress
    @tags (context, ui, knowledge, v2)
    @tests (
        ["../../../packages/analytical/test/context-signals.test.ts"]
        ["../../../packages/extension/test/context-model.test.ts"]
    )
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const attributes = [...AstUtils.streamAst(document.parseResult.value)].filter(isAttribute);
        expect(attributes.map(attribute => attribute.name)).toEqual([
            'status',
            'tags',
            'tests'
        ]);
        const tags = attributes.find(attribute => attribute.name === 'tags');
        expect(tags?.value?.$type).toBe('ListValue');
        if (tags?.value?.$type === 'ListValue') {
            expect(tags.value.items).toHaveLength(4);
            expect(tags.value.items.map(item => item.$cstNode?.text?.trim())).toEqual([
                'context',
                'ui',
                'knowledge',
                'v2'
            ]);
        }
    });

    // rq:["../../../reqlan rq/language/syntax.rq".attribute_forms]
    test('still accepts optional colon before attribute values', async () => {
        const document = await parse(`demo {
    @status: pending
    @tags: (
        todo
    )
}`);
        expect(checkDocumentValid(document)).toBeUndefined();
        const attributes = [...AstUtils.streamAst(document.parseResult.value)].filter(isAttribute);
        expect(attributes.map(attribute => attribute.name)).toEqual(['status', 'tags']);
        expect(attributes[0]?.value?.$cstNode?.text).toBe('pending');
        expect(attributes[1]?.value?.$type).toBe('ListValue');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".attribute_values]
    test('parse syntax_whitespace.rq body lines and insignificant attribute whitespace', async () => {
        const document = await parse(readFileSync(join(repoDir, 'reqlan rq/language/syntax_whitespace.rq'), 'utf8'));
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements.find(isIdea);
        expect(idea?.name).toBe('syntax_whitespace');
        expect(idea?.elements.map(element => element.$type)).toEqual([
            'BodyLine',
            'BodyLine',
            'Attribute',
            'Attribute'
        ]);
        const attributes = idea?.elements.filter(element => element.$type === 'Attribute');
        expect(attributes?.map(attribute => 'name' in attribute && attribute.name)).toEqual([
            'exampleattribute',
            'perfectly_acceptable_attribute'
        ]);
        expect(attributes?.map(attribute => 'value' in attribute && attribute.value?.$cstNode?.text?.trim())).toEqual([
            'the same goes for attributes in an idea',
            'to labour the point'
        ]);
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".at_sign_in_idea_text_block]
    // rq:["../../../reqlan rq/language/syntax.rq".attribute_location]
    test('treats mid-line @ as body text and line-start @ as attribute', async () => {
        const document = await parse(s`
            demo {
                so @this_is_not_an_attribute
                @this_is_an_attribute
            }
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements.find(isIdea);
        expect(idea?.elements.map(element => element.$type)).toEqual([
            'BodyLine',
            'Attribute'
        ]);
        const body = idea?.elements[0];
        expect(body?.$type).toBe('BodyLine');
        if (body?.$type === 'BodyLine') {
            const text = body.parts.map(part => part.text ?? part.punct ?? '').join('');
            expect(text).toContain('@');
            expect(text).toContain('this_is_not_an_attribute');
        }
        const attribute = idea?.elements[1];
        expect(attribute?.$type).toBe('Attribute');
        if (attribute?.$type === 'Attribute') {
            expect(attribute.name).toBe('this_is_an_attribute');
        }
    });

    // rq:["../../../reqlan rq/extension/features-syntax.rq".at_sign_in_idea_text_block]
    test('backslash before @ at line start keeps it as body text', async () => {
        const document = await parse(s`
            demo {
                \\@escaped_attribute
                @real_attribute
            }
        `);
        expect(checkDocumentValid(document)).toBeUndefined();
        const idea = document.parseResult.value.elements.find(isIdea);
        expect(idea?.elements.map(element => element.$type)).toEqual([
            'BodyLine',
            'Attribute'
        ]);
        const body = idea?.elements[0];
        expect(body?.$type).toBe('BodyLine');
        if (body?.$type === 'BodyLine') {
            const text = body.parts.map(part => part.text ?? part.punct ?? '').join('');
            expect(text).toContain('@');
            expect(text).toContain('escaped_attribute');
        }
        const attribute = idea?.elements[1];
        expect(attribute?.$type).toBe('Attribute');
        if (attribute?.$type === 'Attribute') {
            expect(attribute.name).toBe('real_attribute');
        }
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

import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import type { InlayHint, InlayHintLabelPart } from 'vscode-languageserver';
import {
    createReqlanServices,
    isIdea,
    referenceInlayHintsEnabled,
    REQLAN_REFERENCE_INLAY_HINTS_SETTING,
    type Model
} from 'reqlan-language';
import { REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND } from '../src/reqlan-inlay-hint-settings.js';
import {
    buildInboundReferencesInlayLabel,
    buildReferencersTooltipMarkup,
    collectInboundReferencers,
    formatInboundReferencesInlayLabel,
    referencerMarkdownLink
} from '../src/reqlan-inbound-reference-inlay-label.js';
import { ReqlanInlayHintProvider } from '../src/reqlan-inlay-hint-provider.js';

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

function setReferenceInlayHintsEnabled(enabled: boolean): void {
    services.shared.workspace.ConfigurationProvider.updateConfiguration({
        settings: {
            reqlan: {
                [REQLAN_REFERENCE_INLAY_HINTS_SETTING]: { enabled }
            }
        }
    });
}

async function getInlayHintsForDocument(doc: LangiumDocument<Model>) {
    const provider = new ReqlanInlayHintProvider(services.Reqlan);
    return provider.getInlayHints(doc, {
        textDocument: { uri: doc.uri.toString() },
        range: {
            start: { line: 0, character: 0 },
            end: { line: Number.MAX_SAFE_INTEGER, character: 0 }
        }
    });
}

function hintLabelParts(hint: InlayHint): InlayHintLabelPart[] {
    expect(Array.isArray(hint.label)).toBe(true);
    return hint.label as InlayHintLabelPart[];
}

function hintLabelText(hint: InlayHint): string {
    return hintLabelParts(hint).map(part => part.value).join('');
}

describe('Reference inlay hints', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('returns no hints when the setting is disabled', async () => {
        document = await parse(s`
            target {
                body
            }

            source {
                see [target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        setReferenceInlayHintsEnabled(false);

        const hints = await getInlayHintsForDocument(document);

        expect(hints).toEqual([]);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('reads the workspace toggle from configuration', () => {
        expect(referenceInlayHintsEnabled(undefined)).toBe(false);
        expect(referenceInlayHintsEnabled({ enabled: false })).toBe(false);
        expect(referenceInlayHintsEnabled({ enabled: true })).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('formats inbound referencers as an inlayed attribute', () => {
        const formatted = buildInboundReferencesInlayLabel(
            [{
                name: 'alpha',
                location: { uri: 'file:///alpha.rq', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
            }, {
                name: 'beta',
                location: { uri: 'file:///beta.rq', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } } }
            }],
            'file:///target.rq',
            'target'
        );
        expect(formatted?.labelParts.map(part => part.value).join('')).toBe('@referenced-by: (alpha, beta)');
        expect(formatted?.tooltip).toEqual(buildReferencersTooltipMarkup([
            {
                name: 'alpha',
                location: { uri: 'file:///alpha.rq', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
            },
            {
                name: 'beta',
                location: { uri: 'file:///beta.rq', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } } }
            }
        ]));
        const alphaPart = formatted?.labelParts.find(part => part.value === 'alpha');
        expect(alphaPart?.tooltip).toEqual({
            kind: 'markdown',
            value: referencerMarkdownLink({
                name: 'alpha',
                location: { uri: 'file:///alpha.rq', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
            })
        });
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('omits the attribute when there are no inbound referencers', () => {
        expect(formatInboundReferencesInlayLabel([])).toBeUndefined();
        expect(buildInboundReferencesInlayLabel([], 'file:///target.rq', 'target')).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('truncates long referencer lists with a remainder suffix', () => {
        const referencers = ['a', 'b', 'c', 'd', 'e'].map((name, line) => ({
            name,
            location: {
                uri: `file:///${name}.rq`,
                range: { start: { line, character: 0 }, end: { line, character: name.length } }
            }
        }));
        const formatted = buildInboundReferencesInlayLabel(referencers, 'file:///target.rq', 'target');
        expect(formatted?.labelParts.map(part => part.value).join('')).toBe('@referenced-by: (a, b, c, +2 more)');
        expect(formatted?.tooltip).toEqual(buildReferencersTooltipMarkup(referencers));
        const remainder = formatted?.labelParts.find(part => part.value.startsWith('+'));
        expect(remainder?.tooltip).toEqual(buildReferencersTooltipMarkup(referencers));
        expect(remainder?.command?.command).toBe(REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND);
        expect(remainder?.command?.arguments).toEqual(['file:///target.rq', 'target']);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('returns inbound reference hint when the setting is enabled', async () => {
        document = await parse(s`
            target {
                body
            }

            source {
                see [target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        setReferenceInlayHintsEnabled(true);

        const hints = await getInlayHintsForDocument(document);

        expect(hints).toHaveLength(1);
        expect(hintLabelText(hints![0])).toBe('@referenced-by: (source)');
        expect(hints![0].tooltip).toEqual({
            kind: 'markdown',
            value: `**Referenced by**\n\n- ${referencerMarkdownLink({
                name: 'source',
                location: hintLabelParts(hints![0]).find(part => part.value === 'source')!.location!
            })}`
        });
        expect(hints![0].paddingLeft).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".traceable_inlay_hints]
    test('renders referencer tooltips as markdown links for hover navigation', () => {
        const referencers = ['a', 'b', 'c', 'd'].map((name, line) => ({
            name,
            location: {
                uri: `file:///${name}.rq`,
                range: { start: { line, character: 0 }, end: { line, character: name.length } }
            }
        }));
        const tooltip = buildReferencersTooltipMarkup(referencers);
        expect(tooltip.kind).toBe('markdown');
        expect(tooltip.value).toContain('**Referenced by**');
        for (const referrer of referencers) {
            expect(tooltip.value).toContain(referencerMarkdownLink(referrer));
        }
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".traceable_inlay_hints]
    test('attaches source locations to clickable referencer label parts', async () => {
        document = await parse(s`
            target {
                body
            }

            source {
                see [target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        setReferenceInlayHintsEnabled(true);

        const hints = await getInlayHintsForDocument(document);
        const sourcePart = hintLabelParts(hints![0]).find(part => part.value === 'source');

        expect(sourcePart?.location?.uri).toBe(document.uri.toString());
        expect(sourcePart?.location?.range.start.line).toBeGreaterThanOrEqual(0);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('lists multiple inbound referencers in sorted order', async () => {
        document = await parse(s`
            target {
                body
            }

            beta {
                see [target]
            }

            alpha {
                see [target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        setReferenceInlayHintsEnabled(true);

        const hints = await getInlayHintsForDocument(document);

        expect(hints).toHaveLength(1);
        expect(hintLabelText(hints![0])).toBe('@referenced-by: (alpha, beta)');
        expect(typeof hints![0].tooltip).toBe('object');
        const tooltip = hints![0].tooltip as { kind: string; value: string };
        expect(tooltip.kind).toBe('markdown');
        expect(tooltip.value).toContain('[alpha]');
        expect(tooltip.value).toContain('[beta]');
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('omits hint when an idea has no inbound referencers', async () => {
        document = await parse(s`
            lonely {
                no inbound links here
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        setReferenceInlayHintsEnabled(true);

        const hints = await getInlayHintsForDocument(document);

        expect(hints).toEqual([]);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
    test('excludes self-references from inbound referencer names', async () => {
        document = await parse(s`
            target {
                see [target]
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        setReferenceInlayHintsEnabled(true);

        const target = [...AstUtils.streamAst(document.parseResult.value)].find(isIdea);
        expect(target).toBeDefined();
        const referencers = collectInboundReferencers(services.Reqlan, target!);

        expect(referencers).toEqual([]);

        const hints = await getInlayHintsForDocument(document);

        expect(hints).toEqual([]);
    });
});

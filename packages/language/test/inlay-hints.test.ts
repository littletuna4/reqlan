import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import {
    createReqlanServices,
    referenceInlayHintsEnabled,
    REQLAN_REFERENCE_INLAY_HINTS_SETTING,
    type Model
} from 'reqlan-language';
import { formatInboundReferencesInlayLabel } from '../src/reqlan-inbound-reference-inlay-label.js';
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

describe('Reference inlay hints', () => {
    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".view_referenes_as_inlay_hints]
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

        const provider = new ReqlanInlayHintProvider(services.Reqlan);
        const hints = await provider.getInlayHints(document, {
            textDocument: { uri: document.uri.toString() },
            range: {
                start: { line: 0, character: 0 },
                end: { line: Number.MAX_SAFE_INTEGER, character: 0 }
            }
        });

        expect(hints).toEqual([]);
    });

    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".view_referenes_as_inlay_hints]
    test('reads the workspace toggle from configuration', () => {
        expect(referenceInlayHintsEnabled(undefined)).toBe(false);
        expect(referenceInlayHintsEnabled({ enabled: false })).toBe(false);
        expect(referenceInlayHintsEnabled({ enabled: true })).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".view_referenes_as_inlay_hints]
    test('formats inbound referencers as an inlayed attribute', () => {
        expect(formatInboundReferencesInlayLabel(['alpha', 'beta'])).toEqual({
            label: '@referenced-by: (alpha, beta)',
            tooltip: 'alpha\nbeta'
        });
    });

    // rq:["../../../reqlan rq/extension/features-syntax-highlighting.rq".view_referenes_as_inlay_hints]
    test('omits the attribute when there are no inbound referencers', () => {
        expect(formatInboundReferencesInlayLabel([])).toBeUndefined();
    });
});

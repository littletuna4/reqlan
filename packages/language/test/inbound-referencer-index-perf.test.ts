/**
 * Inbound inlay labels from the SQLite snapshot (not Langium IndexManager).
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
 * rq:["../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments } from 'langium/test';
import {
    createReqlanServices,
    isIdea,
    type Model
} from '@reqlan/language';
import {
    collectInboundReferencers,
    type ReferencedDeclaration
} from '../src/reqlan-inbound-reference-inlay-label.js';
import { sharedInboundSnapshot } from '../src/reqlan-inbound-snapshot.js';

let services: ReturnType<typeof createReqlanServices>;

beforeAll(() => {
    services = createReqlanServices(EmptyFileSystem);
});

afterEach(async () => {
    sharedInboundSnapshot.clear();
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
        clearDocuments(services.shared, documents);
    }
});

describe('Inbound SQLite snapshot inlays', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
    test('inlay referencers come from the pushed snapshot, not findAllReferences', async () => {
        const factory = services.shared.workspace.LangiumDocumentFactory;
        const docs = services.shared.workspace.LangiumDocuments;
        const document = factory.fromString(
            [
                `target {`,
                `    body`,
                `}`,
                `other {`,
                `    see [target]`,
                `}`
            ].join('\n'),
            URI.parse('file:///tmp/inbound-snapshot/host.rq')
        ) as LangiumDocument<Model>;
        docs.addDocument(document);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });

        const target = AstUtils.streamAst(document.parseResult.value)
            .filter(isIdea)
            .find(idea => idea.name === 'target') as ReferencedDeclaration;
        expect(target).toBeDefined();

        expect(collectInboundReferencers(services.Reqlan, target)).toEqual([]);

        sharedInboundSnapshot.update({
            snapshots: [{
                documentUri: document.uri.toString(),
                indexedUri: 'host.rq',
                byIdeaName: {
                    target: [{
                        name: 'from_sqlite',
                        uri: 'file:///tmp/inbound-snapshot/other.rq',
                        line: 2
                    }]
                }
            }]
        });

        const referencers = collectInboundReferencers(services.Reqlan, target);
        expect(referencers.map(item => item.name)).toEqual(['from_sqlite']);
        expect(referencers[0]!.location.uri).toBe('file:///tmp/inbound-snapshot/other.rq');
    });
});

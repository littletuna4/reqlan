/**
 * Correctness and performance guards for the inbound referencer index used by inlay hints.
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
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
    buildInboundReferencerIndex,
    declarationInboundKey,
    lookupInboundReferencers,
    type ReferencedDeclaration
} from '../src/reqlan-inbound-reference-inlay-label.js';

let services: ReturnType<typeof createReqlanServices>;

beforeAll(() => {
    services = createReqlanServices(EmptyFileSystem);
});

afterEach(async () => {
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
        clearDocuments(services.shared, documents);
    }
});

function ideaDeclarations(doc: LangiumDocument<Model>): ReferencedDeclaration[] {
    return AstUtils.streamAst(doc.parseResult.value)
        .filter(isIdea)
        .toArray() as ReferencedDeclaration[];
}

/**
 * Many documents each with a local target←source edge.
 * findAllReferences scans every document's refs per call, so N lookups are O(N × totalRefs);
 * one inverse index is O(totalRefs) then O(1) lookups.
 */
async function buildMultiDocumentWorkspace(documentCount: number): Promise<{
    targets: ReferencedDeclaration[];
}> {
    const factory = services.shared.workspace.LangiumDocumentFactory;
    const docs = services.shared.workspace.LangiumDocuments;
    const built: LangiumDocument<Model>[] = [];

    for (let index = 0; index < documentCount; index++) {
        const document = factory.fromString(
            [
                `t${index} {`,
                `    target body ${index}`,
                `}`,
                ``,
                `s${index} {`,
                `    see [t${index}]`,
                `}`
            ].join('\n'),
            URI.parse(`file:///tmp/inlay-perf/doc-${index}.rq`)
        ) as LangiumDocument<Model>;
        docs.addDocument(document);
        built.push(document);
    }

    await services.shared.workspace.DocumentBuilder.build(built, { validation: false });
    const targets = built.flatMap(doc =>
        ideaDeclarations(doc).filter(idea => idea.name.startsWith('t'))
    );
    expect(targets).toHaveLength(documentCount);
    return { targets };
}

describe('Inbound referencer index', () => {
    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
    test('matches findReferences results for inbound refs', async () => {
        const { targets } = await buildMultiDocumentWorkspace(12);
        const index = buildInboundReferencerIndex(services.Reqlan);

        for (const target of targets) {
            const fromIndex = lookupInboundReferencers(index, services.Reqlan, target);
            const fromFind = services.Reqlan.references.References
                .findReferences(target, { includeDeclaration: false })
                .toArray();
            expect(fromIndex.map(item => item.name).sort()).toEqual(
                fromFind.map(ref => {
                    const doc = services.shared.workspace.LangiumDocuments.getDocument(ref.sourceUri);
                    const node = doc
                        ? services.Reqlan.workspace.AstNodeLocator.getAstNode(
                            doc.parseResult.value,
                            ref.sourcePath
                        )
                        : undefined;
                    let current = node;
                    while (current) {
                        if (isIdea(current)) {
                            return current.name;
                        }
                        current = current.$container;
                    }
                    return '';
                }).filter(Boolean).sort()
            );
            expect(index.has(declarationInboundKey(services.Reqlan, target))).toBe(true);
            expect(fromIndex).toHaveLength(1);
        }
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
    test('one-pass index stays well under repeated findReferences cost', async () => {
        // Large enough that per-idea findAllReferences dominates fixed overhead / timer noise.
        const documentCount = 400;
        const { targets } = await buildMultiDocumentWorkspace(documentCount);
        const documents = services.shared.workspace.LangiumDocuments;
        const locator = services.Reqlan.workspace.AstNodeLocator;

        function resolveReferencerNames(target: ReferencedDeclaration): string[] {
            const names: string[] = [];
            for (const reference of services.Reqlan.references.References
                .findReferences(target, { includeDeclaration: false })
                .toArray()) {
                const sourceDocument = documents.getDocument(reference.sourceUri);
                if (!sourceDocument) {
                    continue;
                }
                const sourceNode = locator.getAstNode(
                    sourceDocument.parseResult.value,
                    reference.sourcePath
                );
                let current = sourceNode;
                while (current) {
                    if (isIdea(current)) {
                        names.push(current.name);
                        break;
                    }
                    current = current.$container;
                }
            }
            return names;
        }

        // Warm both paths so first-call JIT / cache noise does not dominate.
        buildInboundReferencerIndex(services.Reqlan);
        for (const target of targets.slice(0, 3)) {
            resolveReferencerNames(target);
        }

        // Median of a few trials — single-shot ratios are noisy when both sides are fast.
        const indexSamples: number[] = [];
        const findSamples: number[] = [];
        let indexedHits = 0;
        let findHits = 0;
        for (let trial = 0; trial < 3; trial++) {
            const indexStarted = performance.now();
            const index = buildInboundReferencerIndex(services.Reqlan);
            indexedHits = 0;
            for (const target of targets) {
                indexedHits += lookupInboundReferencers(index, services.Reqlan, target).length;
            }
            indexSamples.push(performance.now() - indexStarted);

            const findStarted = performance.now();
            findHits = 0;
            for (const target of targets) {
                findHits += resolveReferencerNames(target).length;
            }
            findSamples.push(performance.now() - findStarted);
        }

        const median = (samples: number[]): number => {
            const sorted = [...samples].sort((left, right) => left - right);
            return sorted[Math.floor(sorted.length / 2)]!;
        };
        const indexMs = median(indexSamples);
        const findMs = median(findSamples);

        expect(indexedHits).toBe(documentCount);
        expect(findHits).toBe(documentCount);
        // Absolute budget keeps CI honest on slow hosts; relative guard catches per-idea scans.
        // Use a soft factor (not 0.5): on fast hosts both sides are small and GC/timer noise bites.
        expect(indexMs).toBeLessThan(2_000);
        expect(indexMs).toBeLessThan(findMs * 0.85);
    }, 30_000);
});

import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createReqlanServices, type Model } from '@reqlan/language';
import { extractIndexedDocument } from '../src/index-store/idea-extractor.js';
import { ideaId } from '../src/core/types.js';

describe('idea extractor namespace-alias file refs', () => {
    let parse: ReturnType<typeof parseHelper<Model>>;

    beforeAll(() => {
        const services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper(services.Reqlan);
    });

    test('indexes bare namespace-alias refs as resolved file_reference edges', async () => {
        const source = [
            'import "./widget.ts" as Widget',
            '',
            'host {',
            '    Uses [Widget] for the shell.',
            '    Broken [MissingIdea] stays unresolved.',
            '}',
            ''
        ].join('\n');
        const document = await parse(source, {
            documentUri: URI.file('/workspace/spec.rq'),
            validation: true
        });

        const indexed = extractIndexedDocument(document);
        expect(indexed).toBeDefined();
        const hostId = ideaId(document.uri.toString(), 'host');
        const fileEdges = indexed!.edges.filter(
            edge => edge.sourceId === hostId && edge.kind === 'file_reference'
        );
        const unresolved = indexed!.edges.filter(
            edge => edge.sourceId === hostId && edge.isResolved === false
        );

        expect(fileEdges).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'file_reference',
                    targetFile: './widget.ts',
                    label: 'Widget',
                    isResolved: true
                })
            ])
        );
        expect(unresolved).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'references',
                    label: 'MissingIdea',
                    isResolved: false
                })
            ])
        );
        expect(unresolved.some(edge => edge.label === 'Widget')).toBe(false);
    });
});

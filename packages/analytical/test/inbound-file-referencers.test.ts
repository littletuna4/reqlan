/**
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
 * rq:["../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
 */
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import {
    collectInboundFileReferencers,
    inboundFileReferencerDisplayName,
    inboundFileTargetMatches
} from '../src/core/inbound-file-referencers.js';
import { edgeId, ideaId, type EdgeRecord, type IdeaRecord } from '../src/core/types.js';
import { SqliteIndexStore } from '../src/index-store/sqlite-store.js';

describe('inbound file referencers', () => {
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
    test('matches authored relative file_reference paths against the indexed file', () => {
        const sourceId = 'reqlan rq/cli/cli_package.rq#cli_package';
        expect(
            inboundFileTargetMatches(
                '../extension/index-host/git-codelens.rq',
                sourceId,
                'reqlan rq/extension/index-host/git-codelens.rq'
            )
        ).toBe(true);
        expect(
            inboundFileTargetMatches(
                './other.rq',
                sourceId,
                'reqlan rq/extension/index-host/git-codelens.rq'
            )
        ).toBe(false);
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
    test('collects unique file_reference sources and skips other edge kinds', () => {
        const indexed = 'src/app.ts';
        const referencers = collectInboundFileReferencers(
            [
                {
                    sourceId: 'src/host.rq#uses_app',
                    kind: 'file_reference',
                    targetFile: './app.ts',
                    sourceLine: 4
                },
                {
                    sourceId: 'src/host.rq#uses_app',
                    kind: 'file_reference',
                    targetFile: './app.ts',
                    sourceLine: 4
                },
                {
                    sourceId: 'src/host.rq#commented',
                    kind: 'comment_link',
                    targetFile: 'src/app.ts',
                    sourceLine: 8
                }
            ],
            indexed
        );
        expect(referencers).toEqual([
            {
                name: 'uses_app',
                sourceId: 'src/host.rq#uses_app',
                fileUri: 'src/host.rq',
                line: 4
            }
        ]);
    });

    test('uses the source file name when the idea id is the file sentinel', () => {
        expect(inboundFileReferencerDisplayName('reqs/host.rq#__file__')).toBe('host.rq');
        expect(inboundFileReferencerDisplayName('reqs/host.rq#real_idea')).toBe('real_idea');
    });
});

describe('SqliteIndexStore.listInboundFileReferencers', () => {
    // rq:["../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
    test('resolves relative file_reference edges onto the target file', async () => {
        const sourceFile = 'reqlan rq/cli/cli_package.rq';
        const targetFile = 'reqlan rq/extension/index-host/git-codelens.rq';
        const sourceId = ideaId(sourceFile, 'cli_package');
        const idea: IdeaRecord = {
            id: sourceId,
            name: 'cli_package',
            kind: 'block',
            fileUri: sourceFile,
            lineStart: 1,
            lineEnd: 8,
            summary: '',
            attributesJson: '{}',
            contentHash: 'h1'
        };
        const authored = '../extension/index-host/git-codelens.rq';
        const edge: EdgeRecord = {
            id: edgeId(sourceId, 'file_reference', authored),
            sourceId,
            kind: 'file_reference',
            targetFile: authored,
            label: authored,
            sourceLine: 12,
            isResolved: true
        };
        const store = await SqliteIndexStore.open(
            join(tmpdir(), `reqlan-file-inbound-${randomUUID()}.sqlite`)
        );
        await store.upsertDocument(sourceFile, 'h1', [idea], [edge]);
        const referencers = await store.listInboundFileReferencers(targetFile);
        expect(referencers.map(item => item.name)).toEqual(['cli_package']);
        expect(referencers[0]?.fileUri).toBe(sourceFile);
        await store.close();
    });
});

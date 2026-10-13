/**
 * rq:["../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
 */
import { describe, expect, test } from 'vitest';
import { InboundSnapshotStore } from '../src/reqlan-inbound-snapshot.js';

describe('InboundSnapshotStore', () => {
    // rq:["../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
    test('merges per document and keeps URIs absent from the batch', () => {
        const store = new InboundSnapshotStore();
        store.update({
            snapshots: [{
                documentUri: 'file:///a.rq',
                indexedUri: 'a.rq',
                byIdeaName: {
                    target: [{ name: 'from_b', uri: 'file:///b.rq', line: 1 }]
                }
            }]
        });
        store.update({
            snapshots: [{
                documentUri: 'file:///c.rq',
                indexedUri: 'c.rq',
                byIdeaName: {
                    other: [{ name: 'from_d', uri: 'file:///d.rq', line: 2 }]
                }
            }]
        });

        expect(store.referencersForIdea('file:///a.rq', 'target').map(r => r.name)).toEqual(['from_b']);
        expect(store.referencersForIdea('file:///c.rq', 'other').map(r => r.name)).toEqual(['from_d']);
    });

    // rq:["../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
    test('replaces one document without clearing another', () => {
        const store = new InboundSnapshotStore();
        store.update({
            snapshots: [
                {
                    documentUri: 'file:///a.rq',
                    indexedUri: 'a.rq',
                    byIdeaName: {
                        target: [{ name: 'old', uri: 'file:///b.rq', line: 1 }]
                    }
                },
                {
                    documentUri: 'file:///c.rq',
                    indexedUri: 'c.rq',
                    byIdeaName: {
                        keep: [{ name: 'stable', uri: 'file:///d.rq', line: 0 }]
                    }
                }
            ]
        });
        store.update({
            snapshots: [{
                documentUri: 'file:///a.rq',
                indexedUri: 'a.rq',
                byIdeaName: {
                    target: [{ name: 'new', uri: 'file:///e.rq', line: 3 }]
                }
            }]
        });

        expect(store.referencersForIdea('file:///a.rq', 'target').map(r => r.name)).toEqual(['new']);
        expect(store.referencersForIdea('file:///c.rq', 'keep').map(r => r.name)).toEqual(['stable']);
    });
});

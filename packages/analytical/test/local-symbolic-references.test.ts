/**
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 */
import { describe, expect, it } from 'vitest';
import {
    analyzeLocalSymbolic,
    localSymbolicNeighborIdeas,
    localSymbolicReferenceRowsForIdea,
    localSymbolicReferencesForIdea,
    mergeReferenceRows
} from '../src/native/index.js';
import type { ReferenceListRow } from '../src/core/types.js';

describe('local symbolic references', () => {
    // rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
    it('includes same-file inbound backlinks for a targeted idea', () => {
        const source = `
host {
    See [local_idea].
}
local_idea {
    body
}
peer {
    Also [local_idea].
}
`;
        const doc = analyzeLocalSymbolic('demo/host.rq', source);
        expect(doc.inbound.length).toBeGreaterThanOrEqual(2);

        const localId = 'demo/host.rq#local_idea';
        const refs = localSymbolicReferencesForIdea(doc, localId);
        expect(refs.outbound).toHaveLength(0);
        expect(refs.inbound.map(edge => edge.sourceId).sort()).toEqual([
            'demo/host.rq#host',
            'demo/host.rq#peer'
        ]);

        const rows = localSymbolicReferenceRowsForIdea(doc, localId);
        expect(rows.every(row => row.direction === 'inbound')).toBe(true);
        expect(rows.map(row => row.label).sort()).toEqual(['host', 'peer']);

        const neighbors = localSymbolicNeighborIdeas(doc, localId);
        expect(neighbors.inbound.map(idea => idea.name).sort()).toEqual(['host', 'peer']);
        expect(neighbors.outbound).toHaveLength(0);
    });

    // rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_sidebar]
    it('dedupes indexed and local rows by direction and edge id', () => {
        const indexed: ReferenceListRow[] = [
            {
                edgeId: 'e1',
                direction: 'inbound',
                kind: 'references',
                label: 'host',
                targetName: 'host',
                targetPath: 'demo/host.rq',
                isResolved: true,
                sourceIdeaId: 'demo/host.rq#host',
                targetIdeaId: 'demo/host.rq#local_idea'
            }
        ];
        const local: ReferenceListRow[] = [
            {
                edgeId: 'e1',
                direction: 'inbound',
                kind: 'references',
                label: 'host',
                targetName: 'host',
                targetPath: 'demo/host.rq',
                isResolved: true,
                sourceIdeaId: 'demo/host.rq#host',
                targetIdeaId: 'demo/host.rq#local_idea'
            },
            {
                edgeId: 'e2',
                direction: 'inbound',
                kind: 'references',
                label: 'peer',
                targetName: 'peer',
                targetPath: 'demo/host.rq',
                isResolved: true,
                sourceIdeaId: 'demo/host.rq#peer',
                targetIdeaId: 'demo/host.rq#local_idea'
            }
        ];
        const merged = mergeReferenceRows(indexed, local);
        expect(merged).toHaveLength(2);
        expect(merged.map(row => row.edgeId).sort()).toEqual(['e1', 'e2']);
    });
});

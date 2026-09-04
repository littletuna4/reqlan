/**
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 * rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_sidebar]
 */
import { describe, expect, test } from 'vitest';
import {
    mergeLocalSymbolicNeighborIdeas,
    mergeLocalSymbolicReferenceRows
} from '../src/activity_bar_module/local-symbolic-context.js';
import type { IdeaSummary, ReferenceListRow } from '@reqlan/analytical';

function idea(id: string, name: string): IdeaSummary {
    return {
        id,
        name,
        kind: 'block',
        fileUri: 'demo/host.rq',
        lineStart: 0,
        summary: '',
        statusKey: '__not_present__',
        tags: [],
        tagsKeys: ['__not_present__']
    };
}

describe('local symbolic sidebar merge', () => {
    test('adds same-file inbound from live buffer when index is empty', () => {
        const source = `
host {
    See [local_idea].
}
local_idea {
    body
}
`;
        const rows = mergeLocalSymbolicReferenceRows(
            [],
            'demo/host.rq',
            source,
            'demo/host.rq#local_idea'
        );
        expect(rows.some(row => row.direction === 'inbound' && row.label === 'host')).toBe(true);

        const neighbors = mergeLocalSymbolicNeighborIdeas(
            [],
            [],
            'demo/host.rq',
            source,
            'demo/host.rq#local_idea'
        );
        expect(neighbors.inbound.map(item => item.name)).toEqual(['host']);
        expect(neighbors.outbound).toHaveLength(0);
    });

    test('dedupes indexed inbound with matching local edge id', () => {
        const source = `
host {
    See [local_idea].
}
local_idea {
    body
}
`;
        const localOnly = mergeLocalSymbolicReferenceRows(
            [],
            'demo/host.rq',
            source,
            'demo/host.rq#local_idea'
        );
        expect(localOnly.length).toBeGreaterThan(0);
        const indexed: ReferenceListRow[] = localOnly.map(row => ({ ...row }));
        const merged = mergeLocalSymbolicReferenceRows(
            indexed,
            'demo/host.rq',
            source,
            'demo/host.rq#local_idea'
        );
        expect(merged).toHaveLength(indexed.length);

        const neighbors = mergeLocalSymbolicNeighborIdeas(
            [idea('demo/host.rq#host', 'host')],
            [],
            'demo/host.rq',
            source,
            'demo/host.rq#local_idea'
        );
        expect(neighbors.inbound).toHaveLength(1);
        expect(neighbors.inbound[0]?.name).toBe('host');
    });
});

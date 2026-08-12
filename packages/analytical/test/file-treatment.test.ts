import { describe, expect, test } from 'vitest';
import {
    applyFileTreatment,
    cycleFileTreatment,
    fileCompoundNodeId,
    fileIdeasetDisplayName,
    fileIdeasetNodeId,
    fileTreatmentLabel,
    fileUriFromFileCompoundId,
    fileUriFromFileIdeasetId,
    isFileIdeasetNode,
    normalizeFileTreatment
} from '../src/index-store/file-treatment.js';
import type { GraphViewSlice } from '../src/index-store/webview-graph-queries.js';

function slice(partial: Partial<GraphViewSlice> & Pick<GraphViewSlice, 'nodes' | 'edges'>): GraphViewSlice {
    return {
        query: { includeIndirect: false },
        depth: 1,
        truncated: false,
        ...partial
    };
}

describe('file treatment', () => {
    const alpha = {
        id: 'file:///a.rq#alpha',
        name: 'alpha',
        kind: 'block',
        fileUri: 'file:///a.rq',
        lineStart: 0,
        tags: [] as string[]
    };
    const beta = {
        id: 'file:///a.rq#beta',
        name: 'beta',
        kind: 'oneliner',
        fileUri: 'file:///a.rq',
        lineStart: 2,
        tags: [] as string[]
    };
    const other = {
        id: 'file:///b.rq#other',
        name: 'other',
        kind: 'block',
        fileUri: 'file:///b.rq',
        lineStart: 0,
        tags: [] as string[]
    };
    const external = {
        id: 'file:./readme.md',
        name: 'readme.md',
        kind: 'file',
        fileUri: './readme.md',
        lineStart: 0,
        tags: [] as string[],
        isExternal: true
    };

    test('normalize and cycle modes', () => {
        expect(normalizeFileTreatment('nope')).toBe('linked');
        expect(cycleFileTreatment('invisible')).toBe('compound');
        expect(cycleFileTreatment('compound')).toBe('linked');
        expect(cycleFileTreatment('linked')).toBe('invisible');
        expect(fileTreatmentLabel('compound')).toBe('Files: compound');
        expect(fileTreatmentLabel('linked')).toBe('Files: linked');
    });

    test('display name strips .rq basename', () => {
        expect(fileIdeasetDisplayName('file:///tmp/graph.rq')).toBe('graph');
        expect(fileIdeasetDisplayName('C:\\\\docs\\\\main.rq')).toBe('main');
    });

    test('invisible strips synthetic file ideasets', () => {
        const linked = applyFileTreatment(
            slice({ nodes: [alpha, beta], edges: [] }),
            'linked'
        );
        expect(linked.nodes.some(isFileIdeasetNode)).toBe(true);
        const hidden = applyFileTreatment(linked, 'invisible');
        expect(hidden.nodes.map(node => node.id)).toEqual([alpha.id, beta.id]);
        expect(hidden.edges).toEqual([]);
    });

    test('linked adds one file ideaset per hosting file with member edges', () => {
        const result = applyFileTreatment(
            slice({
                nodes: [alpha, beta, other, external],
                edges: [{ id: 'e1', sourceId: alpha.id, targetId: other.id, kind: 'references' }]
            }),
            'linked'
        );
        const fileNodes = result.nodes.filter(isFileIdeasetNode);
        expect(fileNodes).toHaveLength(2);
        expect(fileNodes.map(node => node.id).sort()).toEqual([
            fileIdeasetNodeId('file:///a.rq'),
            fileIdeasetNodeId('file:///b.rq')
        ]);
        expect(fileNodes.every(node => node.kind === 'ideaset' && node.isFileIdeaset)).toBe(true);
        const memberEdges = result.edges.filter(edge => edge.kind === 'ideaset_member');
        expect(memberEdges).toHaveLength(3);
        expect(result.edges.some(edge => edge.id === 'e1')).toBe(true);
        expect(result.nodes.some(node => node.id === external.id)).toBe(true);
    });

    test('compound matches invisible membership (no synthetic leaves)', () => {
        const base = slice({ nodes: [alpha, beta], edges: [] });
        const compound = applyFileTreatment(base, 'compound');
        expect(compound.nodes.map(node => node.id)).toEqual([alpha.id, beta.id]);
        expect(fileCompoundNodeId('file:///a.rq')).toBe('compound:rq-file:file:///a.rq');
    });

    test('uri helpers decode file compound and linked ids', () => {
        expect(fileUriFromFileCompoundId('compound:rq-file:file:///a.rq')).toBe('file:///a.rq');
        expect(fileUriFromFileIdeasetId('rq-file:file:///a.rq')).toBe('file:///a.rq');
        expect(fileUriFromFileCompoundId('compound:folder/x')).toBeUndefined();
    });
});

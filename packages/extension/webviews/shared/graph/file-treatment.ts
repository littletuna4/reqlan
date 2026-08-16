/**
 * Client-side reshape of graph slices for hosting-.rq / implicit-ideaset treatment.
 * Shared by Ideas Summary cytoscape (HTML export inlines its own copy in app.js).
 * rq:["../../../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".wildcard_refs_toggle]
 */
import type { GraphEdgeView, GraphNodeView, GraphViewSlice } from '../../../src/webview_module/shared/messages.js';

export type FileTreatment = 'invisible' | 'compound' | 'linked';

export const FILE_TREATMENT_MODES: readonly FileTreatment[] = ['invisible', 'compound', 'linked'];

export const DEFAULT_FILE_TREATMENT: FileTreatment = 'linked';

/** Synthetic leaf id for a hosting .rq file rendered as a linked ideaset node. */
export function fileIdeasetNodeId(fileUri: string): string {
    return `rq-file:${fileUri}`;
}

export function isFileIdeasetNodeId(id: string): boolean {
    return id.startsWith('rq-file:');
}

export function isFileIdeasetNode(node: Pick<GraphNodeView, 'id' | 'isFileIdeaset'>): boolean {
    return Boolean(node.isFileIdeaset) || isFileIdeasetNodeId(node.id);
}

/** Display name for an implicit file ideaset (basename without .rq). */
export function fileIdeasetDisplayName(fileUri: string): string {
    const trimmed = fileUri.replace(/\\/g, '/');
    const slash = trimmed.lastIndexOf('/');
    const fileName = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
    return fileName.endsWith('.rq') ? fileName.slice(0, -3) : fileName;
}

/** Cytoscape compound parent id for a hosting file. */
export function fileCompoundNodeId(fileUri: string): string {
    return `compound:rq-file:${fileUri}`;
}

/** Hosting file URI encoded in a `compound:rq-file:…` id, if any. */
export function fileUriFromFileCompoundId(id: string): string | undefined {
    const prefix = 'compound:rq-file:';
    return id.startsWith(prefix) ? id.slice(prefix.length) : undefined;
}

/** Hosting file URI encoded in a `rq-file:…` linked node id, if any. */
export function fileUriFromFileIdeasetId(id: string): string | undefined {
    return isFileIdeasetNodeId(id) ? id.slice('rq-file:'.length) : undefined;
}

export interface FileTreatmentOption {
    id: FileTreatment;
    label: string;
    /** Short toolbar trigger suffix (e.g. "hidden"). */
    shortLabel: string;
    /** Shown as option tooltip / help text. */
    description: string;
}

export const FILE_TREATMENT_OPTIONS: readonly FileTreatmentOption[] = [
    {
        id: 'invisible',
        label: 'Hidden',
        shortLabel: 'hidden',
        description: 'Do not show hosting .rq files — ideas float freely with no file containers or file nodes.'
    },
    {
        id: 'compound',
        label: 'Compound',
        shortLabel: 'compound',
        description: 'Draw each hosting .rq file as a container around its ideas. Drag the box to move members; click the title to open the file.'
    },
    {
        id: 'linked',
        label: 'Linked nodes',
        shortLabel: 'linked',
        description: 'Show each hosting .rq file as an ideaset-styled node linked to its ideas. Click the node to open the file.'
    }
];

export function normalizeFileTreatment(value: unknown): FileTreatment {
    return value === 'compound' || value === 'linked' || value === 'invisible'
        ? value
        : DEFAULT_FILE_TREATMENT;
}

export function cycleFileTreatment(current: FileTreatment): FileTreatment {
    const index = FILE_TREATMENT_MODES.indexOf(current);
    return FILE_TREATMENT_MODES[(index + 1) % FILE_TREATMENT_MODES.length] ?? DEFAULT_FILE_TREATMENT;
}

export function fileTreatmentOption(mode: FileTreatment): FileTreatmentOption {
    return FILE_TREATMENT_OPTIONS.find(option => option.id === mode)
        ?? FILE_TREATMENT_OPTIONS[0]!;
}

export function fileTreatmentLabel(mode: FileTreatment): string {
    return `Files: ${fileTreatmentOption(mode).shortLabel}`;
}

function stripSyntheticFileIdeasets(slice: GraphViewSlice): GraphViewSlice {
    const nodes = slice.nodes.filter(node => !isFileIdeasetNode(node));
    const keep = new Set(nodes.map(node => node.id));
    const edges = slice.edges.filter(
        edge => keep.has(edge.sourceId) && keep.has(edge.targetId)
    );
    if (nodes.length === slice.nodes.length && edges.length === slice.edges.length) {
        return slice;
    }
    return { ...slice, nodes, edges };
}

function memberEligible(node: GraphNodeView): boolean {
    return !node.isExternal && !isFileIdeasetNode(node) && Boolean(node.fileUri);
}

function withLinkedFileIdeasets(slice: GraphViewSlice): GraphViewSlice {
    const base = stripSyntheticFileIdeasets(slice);
    const membersByFile = new Map<string, GraphNodeView[]>();
    for (const node of base.nodes) {
        if (!memberEligible(node)) {
            continue;
        }
        const list = membersByFile.get(node.fileUri) ?? [];
        list.push(node);
        membersByFile.set(node.fileUri, list);
    }

    const extraNodes: GraphNodeView[] = [];
    const extraEdges: GraphEdgeView[] = [];
    for (const [fileUri, members] of [...membersByFile.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
    )) {
        if (members.length === 0) {
            continue;
        }
        const id = fileIdeasetNodeId(fileUri);
        const name = fileIdeasetDisplayName(fileUri);
        extraNodes.push({
            id,
            name,
            kind: 'ideaset',
            fileUri,
            lineStart: 0,
            tags: [],
            isFileIdeaset: true
        });
        for (const member of members) {
            extraEdges.push({
                id: `${id}->ideaset_member:${member.id}`,
                sourceId: id,
                targetId: member.id,
                kind: 'ideaset_member',
                label: name
            });
        }
    }

    if (extraNodes.length === 0) {
        return base;
    }
    return {
        ...base,
        nodes: [...base.nodes, ...extraNodes],
        edges: [...base.edges, ...extraEdges]
    };
}

/**
 * Reshape a graph slice for file / implicit-ideaset treatment.
 * - invisible: no synthetic file nodes (ideas float free)
 * - compound: same membership as invisible; consumers draw file compound parents
 * - linked: add ideaset-styled leaf nodes per hosting file with member edges
 */
export function applyFileTreatment(
    slice: GraphViewSlice,
    treatment: FileTreatment = DEFAULT_FILE_TREATMENT
): GraphViewSlice {
    switch (normalizeFileTreatment(treatment)) {
        case 'linked':
            return withLinkedFileIdeasets(slice);
        case 'compound':
        case 'invisible':
        default:
            return stripSyntheticFileIdeasets(slice);
    }
}

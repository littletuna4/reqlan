/**
 * Shared domain types for the idea graph index and analysers.
 */

export type IdeaKind = 'block' | 'oneliner' | 'ideaset';

export type EdgeKind =
    | 'references'
    | 'file_reference'
    | 'ideaset_member'
    | 'import'
    | 'comment_link';

export interface IdeaRecord {
    id: string;
    name: string;
    kind: IdeaKind;
    fileUri: string;
    lineStart: number;
    lineEnd: number;
    summary: string;
    attributesJson: string;
    contentHash: string;
    gitCreatedAt?: string;
    gitModifiedAt?: string;
}

export interface EdgeRecord {
    id: string;
    sourceId: string;
    targetId?: string;
    targetFile?: string;
    kind: EdgeKind;
    label?: string;
    sourceLine?: number;
    snippet?: string;
    isResolved?: boolean;
}

export interface IdeaAttributeMap {
    [name: string]: string | string[] | boolean;
}

export interface IndexedDocument {
    fileUri: string;
    contentHash: string;
    ideas: IdeaRecord[];
    edges: EdgeRecord[];
}

export interface IdeaSummary {
    id: string;
    name: string;
    kind: IdeaKind;
    fileUri: string;
    lineStart: number;
    summary: string;
    status?: string;
    tags: string[];
    gitCreatedAt?: string;
    gitModifiedAt?: string;
}

export interface IdeaWithRange extends IdeaSummary {
    lineEnd: number;
}

export interface ReferenceListRow {
    edgeId: string;
    direction: 'inbound' | 'outbound';
    kind: EdgeKind;
    label: string;
    targetName: string;
    targetPath: string;
    targetLine?: number;
    sourceLine?: number;
    snippet?: string;
    isResolved: boolean;
    sourceIdeaId: string;
    targetIdeaId?: string;
}

export interface AncestorChainResult {
    ideaId: string;
    ancestors: IdeaSummary[];
    statusRollup: Record<string, number>;
    blocking: IdeaSummary[];
}

export interface OutlineNode {
    id: string;
    name: string;
    lineStart: number;
    lineEnd: number;
    children: OutlineNode[];
}

export type { ActivityBarScope, CurrentFileSlice, ReqlanContextModel } from './context-model.js';
export {
    CONTEXT_DIMENSION_LABELS,
    CONTEXT_DIMENSION_WEIGHTS,
    DEFAULT_ENABLED_DIMENSIONS
} from './context-model.js';
export type {
    ContextAnomaly,
    ContextDimensionContribution,
    ContextDimensionId,
    ContextFileEntry,
    ContextFocus,
    ContextFocusKind,
    ContextFootprint,
    ContextIdeaEntry,
    ContextProvenance,
    ContextReferencesSlice,
    GitContextSlice,
    WorkspaceContextSlice
} from './context-model.js';

export const ACTIVITY_BAR_MAX_NODES = 40;

export const BLOCKING_STATUSES = new Set([
    'pending',
    'todo',
    'open',
    'blocked',
    'stub',
    'unspecified'
]);

export interface GraphSlice {
    centerId: string;
    depth: number;
    nodes: IdeaSummary[];
    edges: EdgeRecord[];
}

export interface CompletionSummary {
    total: number;
    byStatus: Record<string, number>;
    byTag: Record<string, number>;
    outstanding: IdeaSummary[];
    deprecated: IdeaSummary[];
}

export interface DeprecationImpact {
    deprecated: IdeaSummary;
    dependents: IdeaSummary[];
}

export interface SemanticMatch {
    idea: IdeaSummary;
    score: number;
    reasons: string[];
}

export interface IdeaReferenceChip {
    label: string;
    fileUri: string;
    line: number;
    direction: 'inbound' | 'outbound';
    filterKey: string;
}

export interface IdeaTableRow {
    id: string;
    title: string;
    path: string;
    mainAttribute?: string;
    otherAttributes: string;
    otherAttributeItems: string[];
    attributeValues: Record<string, string>;
    referenceCount: number;
    outboundCount: number;
    inboundCount: number;
    outboundReferences: IdeaReferenceChip[];
    inboundReferences: IdeaReferenceChip[];
    fileUri: string;
    lineStart: number;
    stabilityCue?: number;
    stabilityLabel?: string;
}

export type IdeasetKind = 'file' | 'explicit';

export interface IdeasetMemberRow {
    name: string;
    fileUri: string;
    lineStart: number;
}

export interface IdeasetTableRow {
    id: string;
    name: string;
    path: string;
    kind: IdeasetKind;
    memberCount: number;
    members: IdeasetMemberRow[];
    fileUri: string;
    lineStart: number;
}

export type ReferenceViewType = 'file' | 'comment' | 'sub-idea';

export interface ReferenceTableRow {
    sourcePath: string;
    sourceName: string;
    targetPath: string;
    targetName: string;
    isInRq: boolean;
    referenceType: ReferenceViewType;
    sourceFileUri: string;
    sourceLineStart: number;
}

export interface FileRelatedRequirements {
    fileUri: string;
    ideasInFile: IdeaSummary[];
    referencingIdeas: IdeaSummary[];
    commentLinkedIdeas: IdeaSummary[];
    folderReferencingIdeas: IdeaSummary[];
}

export function ideaId(fileUri: string, name: string): string {
    return `${fileUri}#${name}`;
}

export function edgeId(sourceId: string, kind: EdgeKind, target: string): string {
    return `${sourceId}->${kind}:${target}`;
}

export function parseAttributes(json: string): IdeaAttributeMap {
    try {
        return JSON.parse(json) as IdeaAttributeMap;
    } catch {
        return {};
    }
}

export function ideaTags(attributes: IdeaAttributeMap): string[] {
    const tags = attributes.tags;
    if (Array.isArray(tags)) {
        return tags.map(String);
    }
    if (typeof tags === 'string') {
        return tags.split(/[,\s]+/).filter(Boolean);
    }
    return [];
}

export function ideaStatus(attributes: IdeaAttributeMap): string | undefined {
    const status = attributes.status;
    return typeof status === 'string' ? status : undefined;
}

export function isDeprecated(attributes: IdeaAttributeMap): boolean {
    if (attributes.deprecated === true) {
        return true;
    }
    return ideaTags(attributes).some(tag => tag.toLowerCase() === 'deprecated');
}

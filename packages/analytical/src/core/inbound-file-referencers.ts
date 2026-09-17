/**
 * Match indexed file_reference edges whose resolved target is the open file.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
 */
import { posix } from 'node:path';
import { resolveReferencedFilePath } from './file-reference-resolve.js';

export interface InboundFileReferencerEdge {
    sourceId: string;
    kind: string;
    targetFile?: string;
    label?: string;
    sourceLine?: number;
}

export interface InboundFileReferencer {
    name: string;
    sourceId: string;
    fileUri: string;
    line: number;
}

const FILE_IDEA_SENTINEL = '__file__';

export function normalizeIndexedPath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function fileFromIdeaId(sourceId: string): string {
    const separator = sourceId.lastIndexOf('#');
    return separator >= 0 ? sourceId.slice(0, separator) : sourceId;
}

export function ideaNameFromId(sourceId: string): string {
    const separator = sourceId.lastIndexOf('#');
    return separator >= 0 ? sourceId.slice(separator + 1) : sourceId;
}

export function inboundFileReferencerDisplayName(sourceId: string): string {
    const name = ideaNameFromId(sourceId);
    if (name && name !== FILE_IDEA_SENTINEL) {
        return name;
    }
    const file = fileFromIdeaId(sourceId);
    const base = posix.basename(normalizeIndexedPath(file));
    return base || name || sourceId;
}

export function inboundFileTargetMatches(
    authoredTarget: string,
    sourceId: string,
    indexedUri: string
): boolean {
    const indexed = normalizeIndexedPath(indexedUri);
    const authored = normalizeIndexedPath(authoredTarget);
    if (!indexed || !authored) {
        return false;
    }
    if (authored === indexed) {
        return true;
    }
    const resolved = normalizeIndexedPath(resolveReferencedFilePath(authoredTarget, sourceId));
    if (resolved === indexed) {
        return true;
    }
    return resolved.endsWith(`/${indexed}`) || indexed.endsWith(`/${resolved}`);
}

export function collectInboundFileReferencers(
    edges: readonly InboundFileReferencerEdge[],
    indexedUri: string
): InboundFileReferencer[] {
    const seen = new Set<string>();
    const out: InboundFileReferencer[] = [];
    for (const edge of edges) {
        if (edge.kind !== 'file_reference') {
            continue;
        }
        const authored = edge.targetFile ?? edge.label;
        if (!authored || !inboundFileTargetMatches(authored, edge.sourceId, indexedUri)) {
            continue;
        }
        const line = edge.sourceLine ?? 0;
        const key = `${edge.sourceId}#${line}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push({
            name: inboundFileReferencerDisplayName(edge.sourceId),
            sourceId: edge.sourceId,
            fileUri: fileFromIdeaId(edge.sourceId),
            line
        });
    }
    return out.sort((left, right) => left.name.localeCompare(right.name));
}

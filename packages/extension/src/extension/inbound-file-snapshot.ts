/**
 * Map indexed inbound file referencers into the LSP snapshot shape.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
 */
import type { InboundFileReferencer } from '@reqlan/analytical';
import type { InboundSnapshotReferencer } from '@reqlan/language';

export function lspLineFromIndexedSourceLine(line: number | undefined): number {
    if (line === undefined) {
        return 0;
    }
    return Math.max(0, line - 1);
}

export function toFileReferencerSnapshotRows(
    referencers: readonly InboundFileReferencer[],
    resolveSourceUri: (indexedUri: string) => string
): InboundSnapshotReferencer[] {
    return referencers.map(item => ({
        name: item.name,
        uri: resolveSourceUri(item.fileUri),
        line: lspLineFromIndexedSourceLine(item.line)
    }));
}

/**
 * SQLite inbound snapshot pushed from the extension host for inlay / code lens.
 * rq:["../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
 * rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 */
import type { Location } from 'vscode-languageserver';
import type { InboundReferencer } from './reqlan-inbound-reference-inlay-label.js';

export interface InboundSnapshotReferencer {
    name: string;
    uri: string;
    line: number;
    character?: number;
}

export interface InboundFileSnapshot {
    /** LSP document URI (`file://…`). */
    documentUri: string;
    /** Indexed relative path used in SQLite. */
    indexedUri: string;
    /** Target idea / ideaset name → inbound referencers. */
    byIdeaName: Record<string, InboundSnapshotReferencer[]>;
}

export interface InboundSnapshotBatch {
    snapshots: InboundFileSnapshot[];
}

export class InboundSnapshotStore {
    private readonly byDocumentUri = new Map<string, InboundFileSnapshot>();

    update(batch: InboundSnapshotBatch): void {
        for (const snapshot of batch.snapshots) {
            this.byDocumentUri.set(snapshot.documentUri, {
                documentUri: snapshot.documentUri,
                indexedUri: snapshot.indexedUri,
                byIdeaName: { ...snapshot.byIdeaName }
            });
        }
    }

    clear(): void {
        this.byDocumentUri.clear();
    }

    getForDocument(documentUri: string): InboundFileSnapshot | undefined {
        return this.byDocumentUri.get(documentUri);
    }

    referencersForIdea(documentUri: string, ideaName: string): InboundReferencer[] {
        const snapshot = this.byDocumentUri.get(documentUri);
        if (!snapshot) {
            return [];
        }
        const rows = snapshot.byIdeaName[ideaName] ?? [];
        return rows
            .map(row => ({
                name: row.name,
                location: {
                    uri: row.uri,
                    range: {
                        start: { line: row.line, character: row.character ?? 0 },
                        end: { line: row.line, character: (row.character ?? 0) + row.name.length }
                    }
                } satisfies Location
            }))
            .sort((left, right) => left.name.localeCompare(right.name));
    }
}

export const REQLAN_INBOUND_SNAPSHOT_NOTIFICATION = 'reqlan/inboundSnapshot';

export const sharedInboundSnapshot = new InboundSnapshotStore();

/**
 * Pure scheduling helpers for host→LSP inbound snapshot pushes.
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
 */
import type { InboundSnapshotReferencer } from '@reqlan/language';

/** Host may push only while the ideas index is ready (never an empty wipe mid-sync). */
export function shouldPushInboundSnapshots(indexReady: boolean): boolean {
    return indexReady;
}

export function dedupeReferencers(rows: InboundSnapshotReferencer[]): InboundSnapshotReferencer[] {
    const seen = new Set<string>();
    const out: InboundSnapshotReferencer[] = [];
    for (const row of rows) {
        const key = `${row.uri}#${row.line}:${row.name}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(row);
    }
    return out.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Coalesce async push work so catalog spam drains to one ready-state pass.
 */
export function createCoalescedRunner(run: () => Promise<void>): () => void {
    let inFlight: Promise<void> | undefined;
    let queued = false;
    const schedule = (): void => {
        queued = true;
        if (inFlight) {
            return;
        }
        inFlight = (async () => {
            try {
                while (queued) {
                    queued = false;
                    await run();
                }
            } finally {
                inFlight = undefined;
                if (queued) {
                    schedule();
                }
            }
        })();
    };
    return schedule;
}

/**
 * rq:["../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
 */
import { describe, expect, test } from 'vitest';
import {
    createCoalescedRunner,
    dedupeReferencers,
    shouldPushInboundSnapshots
} from '../src/extension/inbound-snapshot-schedule.js';

describe('inbound snapshot push', () => {
    // rq:["../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
    test('does not push while the index is not ready (defer instead of empty wipe)', () => {
        expect(shouldPushInboundSnapshots(false)).toBe(false);
        expect(shouldPushInboundSnapshots(true)).toBe(true);
    });

    // rq:["../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
    test('dedupes referencers by uri, line, and name', () => {
        expect(dedupeReferencers([
            { name: 'b', uri: 'file:///a.rq', line: 1 },
            { name: 'a', uri: 'file:///a.rq', line: 0 },
            { name: 'b', uri: 'file:///a.rq', line: 1 }
        ])).toEqual([
            { name: 'a', uri: 'file:///a.rq', line: 0 },
            { name: 'b', uri: 'file:///a.rq', line: 1 }
        ]);
    });

    // rq:["../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
    test('coalesces concurrent schedules into one drained pass', async () => {
        let runs = 0;
        let release!: () => void;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        let resolveDone!: () => void;
        const done = new Promise<void>(resolve => {
            resolveDone = resolve;
        });
        const schedule = createCoalescedRunner(async () => {
            runs += 1;
            if (runs === 1) {
                await gate;
                return;
            }
            resolveDone();
        });
        schedule();
        schedule();
        schedule();
        expect(runs).toBe(1);
        release();
        await done;
        expect(runs).toBe(2);
    });
});


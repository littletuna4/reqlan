/**
 * rq:["../../../reqlan rq/extension/language-support/initialisation-and-sequencing.rq".index_file_search_coalesce]
 */
import { describe, expect, test } from 'vitest';
import { shareInFlight, type InFlightSlot } from '../src/shared/share-in-flight.js';

describe('shareInFlight', () => {
    test('overlapping callers share one start', async () => {
        const slot: InFlightSlot<number> = {};
        let starts = 0;
        const start = (): Promise<number> => {
            starts += 1;
            return new Promise(resolve => {
                setTimeout(() => resolve(7), 20);
            });
        };
        const [first, second] = await Promise.all([
            shareInFlight(slot, start),
            shareInFlight(slot, start)
        ]);
        expect(first).toBe(7);
        expect(second).toBe(7);
        expect(starts).toBe(1);
        const third = await shareInFlight(slot, start);
        expect(third).toBe(7);
        expect(starts).toBe(2);
    });
});

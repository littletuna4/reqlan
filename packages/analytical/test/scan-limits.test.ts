/**
 * rq:["../../../reqlan rq/indexer/sequencing.rq".scan_limits]
 */
import { describe, expect, test } from 'vitest';
import {
    clampScanLimits,
    DEFAULT_SCAN_MAX_DEPTH,
    DEFAULT_SCAN_MAX_ENTRIES,
    SCAN_MAX_DEPTH_LIMIT,
    SCAN_MAX_ENTRIES_LIMIT
} from '../src/core/scan-limits.js';

describe('scan limits', () => {
    test('clamps depth and entries into the allowed range', () => {
        expect(clampScanLimits(0, 0)).toEqual({ maxDepth: 1, maxEntries: 1 });
        expect(clampScanLimits(8, 20_000)).toEqual({
            maxDepth: DEFAULT_SCAN_MAX_DEPTH,
            maxEntries: DEFAULT_SCAN_MAX_ENTRIES
        });
        expect(clampScanLimits(100, 9_000_000)).toEqual({
            maxDepth: SCAN_MAX_DEPTH_LIMIT,
            maxEntries: SCAN_MAX_ENTRIES_LIMIT
        });
        expect(clampScanLimits(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
            maxDepth: DEFAULT_SCAN_MAX_DEPTH,
            maxEntries: SCAN_MAX_ENTRIES_LIMIT
        });
    });
});

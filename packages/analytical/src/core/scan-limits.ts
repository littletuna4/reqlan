/**
 * Caps for the one workspace directory scan.
 * The numbers are defaults.json. This module only clamps editor and headless input.
 * The walk starts before a base config exists, so the editor passes these from settings.
 * CLI and MCP use the same defaults inside the native scan.
 * rq:["../../../../reqlan rq/indexer/sequencing.rq".scan_limits]
 */
import {
    DEFAULT_SCAN_MAX_DEPTH,
    DEFAULT_SCAN_MAX_ENTRIES,
    SCAN_MIN_DEPTH,
    SCAN_MAX_DEPTH_LIMIT,
    SCAN_MIN_ENTRIES,
    SCAN_MAX_ENTRIES_LIMIT
} from './defaults.js';

export {
    DEFAULT_SCAN_MAX_DEPTH,
    DEFAULT_SCAN_MAX_ENTRIES,
    SCAN_MIN_DEPTH,
    SCAN_MAX_DEPTH_LIMIT,
    SCAN_MIN_ENTRIES,
    SCAN_MAX_ENTRIES_LIMIT
};

export interface ScanLimits {
    maxDepth: number;
    maxEntries: number;
}

function clampBound(value: number, fallback: number, min: number, max: number): number {
    if (value === Number.POSITIVE_INFINITY) {
        return max;
    }
    if (!Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function clampScanLimits(maxDepth: number, maxEntries: number): ScanLimits {
    return {
        maxDepth: clampBound(maxDepth, DEFAULT_SCAN_MAX_DEPTH, SCAN_MIN_DEPTH, SCAN_MAX_DEPTH_LIMIT),
        maxEntries: clampBound(maxEntries, DEFAULT_SCAN_MAX_ENTRIES, SCAN_MIN_ENTRIES, SCAN_MAX_ENTRIES_LIMIT)
    };
}

/**
 * Caps for the one workspace directory scan.
 * The walk starts before a base config exists, so the editor passes these from settings.
 * CLI and MCP use the same defaults inside the native scan.
 * rq:["../../../../reqlan rq/indexer/sequencing.rq".scan_limits]
 */

export const DEFAULT_SCAN_MAX_DEPTH = 8;
export const DEFAULT_SCAN_MAX_ENTRIES = 20_000;
export const SCAN_MAX_DEPTH_LIMIT = 32;
export const SCAN_MAX_ENTRIES_LIMIT = 500_000;

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
        maxDepth: clampBound(maxDepth, DEFAULT_SCAN_MAX_DEPTH, 1, SCAN_MAX_DEPTH_LIMIT),
        maxEntries: clampBound(maxEntries, DEFAULT_SCAN_MAX_ENTRIES, 1, SCAN_MAX_ENTRIES_LIMIT)
    };
}

/**
 * rq:["../../../reqlan rq/indexer/sequencing.rq".scan_limits]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
    clampScanLimits,
    DEFAULT_SCAN_MAX_DEPTH,
    DEFAULT_SCAN_MAX_ENTRIES,
    SCAN_MIN_DEPTH,
    SCAN_MAX_DEPTH_LIMIT,
    SCAN_MIN_ENTRIES,
    SCAN_MAX_ENTRIES_LIMIT
} from '../src/core/scan-limits.js';
import defaults from '../src/core/defaults.json' with { type: 'json' };

const extensionPackagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../extension/package.json'
);

describe('scan limits', () => {
    test('clamps depth and entries into the allowed range', () => {
        expect(clampScanLimits(SCAN_MIN_DEPTH - 1, SCAN_MIN_ENTRIES - 1)).toEqual({
            maxDepth: SCAN_MIN_DEPTH,
            maxEntries: SCAN_MIN_ENTRIES
        });
        expect(clampScanLimits(DEFAULT_SCAN_MAX_DEPTH, DEFAULT_SCAN_MAX_ENTRIES)).toEqual({
            maxDepth: DEFAULT_SCAN_MAX_DEPTH,
            maxEntries: DEFAULT_SCAN_MAX_ENTRIES
        });
        expect(clampScanLimits(SCAN_MAX_DEPTH_LIMIT + 1, SCAN_MAX_ENTRIES_LIMIT + 1)).toEqual({
            maxDepth: SCAN_MAX_DEPTH_LIMIT,
            maxEntries: SCAN_MAX_ENTRIES_LIMIT
        });
        expect(clampScanLimits(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
            maxDepth: DEFAULT_SCAN_MAX_DEPTH,
            maxEntries: SCAN_MAX_ENTRIES_LIMIT
        });
    });

    test('editor scan settings match defaults.json', () => {
        const limits = defaults.scan;
        expect({
            defaultMaxDepth: DEFAULT_SCAN_MAX_DEPTH,
            defaultMaxEntries: DEFAULT_SCAN_MAX_ENTRIES,
            minDepth: SCAN_MIN_DEPTH,
            maxDepthLimit: SCAN_MAX_DEPTH_LIMIT,
            minEntries: SCAN_MIN_ENTRIES,
            maxEntriesLimit: SCAN_MAX_ENTRIES_LIMIT
        }).toEqual(limits);
        expect(readScanSetting('reqlan.scan.maxDepth')).toEqual({
            type: 'number',
            default: limits.defaultMaxDepth,
            minimum: limits.minDepth,
            maximum: limits.maxDepthLimit
        });
        expect(readScanSetting('reqlan.scan.maxEntries')).toEqual({
            type: 'number',
            default: limits.defaultMaxEntries,
            minimum: limits.minEntries,
            maximum: limits.maxEntriesLimit
        });
    });
});

function readScanSetting(key: string): {
    type: string;
    default: number;
    minimum: number;
    maximum: number;
} {
    const setting = walk(JSON.parse(readFileSync(extensionPackagePath, 'utf8')), [
        'contributes',
        'configuration',
        'properties',
        key
    ]);
    if (!isScanSetting(setting)) {
        throw new Error(`${key} is not a numeric scan setting`);
    }
    return {
        type: setting.type,
        default: setting.default,
        minimum: setting.minimum,
        maximum: setting.maximum
    };
}

function walk(value: unknown, path: readonly string[]): unknown {
    let current = value;
    for (const key of path) {
        if (!isRecord(current) || !(key in current)) {
            throw new Error(`extension package.json is missing ${path.join('.')}`);
        }
        current = current[key];
    }
    return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScanSetting(value: unknown): value is {
    type: string;
    default: number;
    minimum: number;
    maximum: number;
} {
    return isRecord(value)
        && typeof value.type === 'string'
        && typeof value.default === 'number'
        && typeof value.minimum === 'number'
        && typeof value.maximum === 'number';
}

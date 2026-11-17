/**
 * Tests for CLI version parsing and comparison helpers.
 * rq:["../../../reqlan rq/extension/host/cli-version-check.rq".cli_version_check]
 */
import { describe, expect, test } from 'vitest';
import { compareSemver, parseCliVersionOutput } from '../src/extension/cli-version-helpers.js';

describe('cli version helpers', () => {
    test('parseCliVersionOutput reads the first version token', () => {
        // rq:["../../../reqlan rq/extension/host/cli-version-check.rq".cli_version_check]
        expect(parseCliVersionOutput('0.17.1\n')).toBe('0.17.1');
        expect(parseCliVersionOutput('reqlan 0.17.1\n')).toBe('0.17.1');
        expect(parseCliVersionOutput('v0.17.1')).toBe('0.17.1');
    });

    test('parseCliVersionOutput rejects output without a release version', () => {
        expect(parseCliVersionOutput('')).toBeNull();
        expect(parseCliVersionOutput('not a version\n')).toBeNull();
        expect(parseCliVersionOutput('1.2\n')).toBeNull();
    });

    test('compareSemver ranks major, minor, and patch', () => {
        // rq:["../../../reqlan rq/extension/host/cli-version-check.rq".cli_version_check]
        expect(compareSemver('0.17.1', '0.17.1')).toBe(0);
        expect(compareSemver('0.17.1', '0.17.2')).toBe(-1);
        expect(compareSemver('0.17.1', '0.18.0')).toBe(-1);
        expect(compareSemver('0.17.1', '1.0.0')).toBe(-1);
        expect(compareSemver('0.17.2', '0.17.1')).toBe(1);
        expect(compareSemver('1.0.0', '0.99.99')).toBe(1);
    });
});

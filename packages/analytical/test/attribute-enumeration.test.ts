/**
 * Tests for project attribute enumeration.
 * per ["../../reqlan rq/extension/attribute-enumeration.rq".attribute_enumeration]
 */
import { describe, expect, test } from 'vitest';
import { enumerateProjectAttributes } from '../src/core/attribute-enumeration.js';

describe('enumerateProjectAttributes', () => {
    test('returns sorted unique keys from rows', async () => {
        const rows = [
            { id: 'a', attributes_json: '{"status":"todo","tags":["ui"]}' },
            { id: 'b', attributes_json: '{"status":"done","owner":"alice"}' },
            { id: 'c', attributes_json: '{"flag":true}' }
        ];
        const keys = await enumerateProjectAttributes(() => rows);
        expect(keys).toEqual(['flag', 'owner', 'status', 'tags']);
    });

    test('ignores meaningless attributes (empty values)', async () => {
        const rows = [
            { id: 'a', attributes_json: '{"status":""}' },
            { id: 'b', attributes_json: '{"flag":true}' }
        ];
        const keys = await enumerateProjectAttributes(() => rows);
        expect(keys).toEqual(['flag']);
    });

    test('returns empty array for no rows', async () => {
        const keys = await enumerateProjectAttributes(() => []);
        expect(keys).toEqual([]);
    });

    test('returns empty array for no attributes', async () => {
        const rows = [
            { id: 'a', attributes_json: '{}' },
            { id: 'b', attributes_json: '{}' }
        ];
        const keys = await enumerateProjectAttributes(() => rows);
        expect(keys).toEqual([]);
    });

    test('deduplicates keys across ideas', async () => {
        const rows = [
            { id: 'a', attributes_json: '{"status":"todo"}' },
            { id: 'b', attributes_json: '{"status":"done"}' },
            { id: 'c', attributes_json: '{"status":"review"}' }
        ];
        const keys = await enumerateProjectAttributes(() => rows);
        expect(keys).toEqual(['status']);
    });
});

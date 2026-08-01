import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
    APPLICATION_MEMORY_DIR,
    IDEAS_INDEX_FILENAME,
    resolveApplicationMemoryPath,
    resolveIdeasIndexDbPath
} from '../src/core/application-memory.js';

describe('application memory paths', () => {
    test('defaults to <workspace>/.reqlan', () => {
        expect(resolveApplicationMemoryPath('/repo')).toBe(join('/repo', APPLICATION_MEMORY_DIR));
        expect(resolveIdeasIndexDbPath('/repo')).toBe(
            join('/repo', APPLICATION_MEMORY_DIR, IDEAS_INDEX_FILENAME)
        );
    });

    test('honours storagePath override', () => {
        expect(resolveApplicationMemoryPath('/repo', '/tmp/custom')).toBe('/tmp/custom');
        expect(resolveIdeasIndexDbPath('/repo', '/tmp/custom')).toBe(
            join('/tmp/custom', IDEAS_INDEX_FILENAME)
        );
    });
});

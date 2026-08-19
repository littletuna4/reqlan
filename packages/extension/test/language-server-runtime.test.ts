/**
 * rq:["../../reqlan rq/core_analysis/core.rq".consumption_silence]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { LANGUAGE_SERVER_NODE_PROBE_OPTIONS } from '../src/extension/language-server-runtime.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('language server node probe', () => {
    test('hides the Windows console when probing node', () => {
        expect(LANGUAGE_SERVER_NODE_PROBE_OPTIONS.windowsHide).toBe(true);
        expect(LANGUAGE_SERVER_NODE_PROBE_OPTIONS.encoding).toBe('utf8');
    });

    test('runtime probe uses the hidden options object', () => {
        const source = readFileSync(
            join(here, '../src/extension/language-server-runtime.ts'),
            'utf8'
        );
        expect(source).toContain('LANGUAGE_SERVER_NODE_PROBE_OPTIONS');
        expect(source).toContain('withHiddenConsole');
    });
});

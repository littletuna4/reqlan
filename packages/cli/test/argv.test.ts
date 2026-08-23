/**
 * rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
 */
import { describe, expect, test } from 'vitest';
import { argvForClipanion } from '../src/argv.js';

describe('argvForClipanion', () => {
    test('drops a lone end-of-options marker', () => {
        expect(argvForClipanion(['check', '--', '--skip-target', '**/.cursor/**'])).toEqual([
            'check',
            '--skip-target',
            '**/.cursor/**'
        ]);
        expect(argvForClipanion(['check', '--skip-target', '**/.cursor/**'])).toEqual([
            'check',
            '--skip-target',
            '**/.cursor/**'
        ]);
        expect(argvForClipanion(['check'])).toEqual(['check']);
    });
});

/**
 * rq:["../../../reqlan rq/core_analysis/core.rq".consumption_silence]
 */
import { describe, expect, test } from 'vitest';
import { withHiddenConsole } from '../src/shared/hidden-exec-file.js';

describe('hidden child-process options', () => {
    test('always sets windowsHide after caller options', () => {
        expect(withHiddenConsole({ cwd: '/tmp', timeout: 1000, windowsHide: false })).toEqual({
            cwd: '/tmp',
            timeout: 1000,
            windowsHide: true
        });
    });
});

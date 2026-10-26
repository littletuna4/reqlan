/**
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_verbose]
 */
import { describe, expect, test } from 'vitest';
import type { CheckReport } from '@reqlan/analytical/core';
import { formatCheckVerbose, parseCheckVerbosity } from '../src/format-check-verbose.js';

const report: CheckReport = {
    issues: [{ fileUri: 'host.rq', kind: 'references', label: 'missing_idea', severity: 'error' }],
    indexMode: 'memory',
    sync: {
        processed: 2,
        total: 2,
        skippedMtime: 1,
        indexed: 1,
        errors: 0,
        cancelled: false
    },
    files: [
        { file: 'host.rq', action: 'indexed' },
        { file: 'src/app.ts', action: 'skipped_mtime', detail: 'mtime unchanged' }
    ]
};

describe('format-check-verbose', () => {
    test('formats verbosity levels', () => {
        expect(formatCheckVerbose(report, 0)).toBe('');

        const v = formatCheckVerbose(report, 1);
        expect(v).toContain('check: index=memory');
        expect(v).toContain('indexed=1 skipped_mtime=1 errors=0 processed=2/2');
        expect(v).toContain('check: issues=1');
        expect(v).not.toContain('host.rq');

        const vv = formatCheckVerbose(report, 2);
        expect(vv).toContain('check: indexed host.rq');
        expect(vv).toContain('check: skipped_mtime src/app.ts');
        expect(vv).not.toContain('mtime unchanged');

        const vvv = formatCheckVerbose(report, 3);
        expect(vvv).toContain('check: skipped_mtime src/app.ts (mtime unchanged)');
    });

    test('parses -v -vv -vvv tokens', () => {
        expect(parseCheckVerbosity([], false, false, false)).toBe(0);
        expect(parseCheckVerbosity(['-v'], true, false, false)).toBe(1);
        expect(parseCheckVerbosity(['-vv'], false, false, false)).toBe(2);
        expect(parseCheckVerbosity(['-vvv'], false, false, false)).toBe(3);
        expect(parseCheckVerbosity(['-vv', '-vvv'], false, false, false)).toBe(3);
    });
});

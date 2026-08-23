/**
 * Native `//rq-ignore-error` scanner via napi.
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import { describe, expect, it } from 'vitest';
import { findRqIgnoreErrorTargetLines } from '../src/native/ignore-error.js';
import { tryLoadNativeEngine } from '../src/native/load-native.js';

describe('native ignore-error', () => {
    it('marks the line after the directive', () => {
        if (!tryLoadNativeEngine()?.findRqIgnoreErrorTargetLines) {
            return;
        }
        const text = 'keep this //rq-ignore-error\nnext line\n//rq-ignore-error\nanother line\n';
        expect([...findRqIgnoreErrorTargetLines(text)].sort((a, b) => a - b)).toEqual([1, 3]);
    });

    it('does not treat the marker inside strings as a directive', () => {
        if (!tryLoadNativeEngine()?.findRqIgnoreErrorTargetLines) {
            return;
        }
        const text = 'demo { note "//rq-ignore-error" here\nbroken line }';
        expect(findRqIgnoreErrorTargetLines(text)).toEqual([]);
    });
});

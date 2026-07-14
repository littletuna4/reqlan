import { describe, expect, test } from 'vitest';
import {
    adjustDimensionHopDepth,
    adjustGlobalHopDepth,
    createContextSession,
    effectiveHopDepth
} from '../src/activity_bar_module/context-session.js';

describe('context hop depth', () => {
    test('adjustGlobalHopDepth clamps at min and max', () => {
        const session = createContextSession();
        expect(session.globalHopDepth).toBe(1);
        adjustGlobalHopDepth(session, -1);
        expect(session.globalHopDepth).toBe(1);
        adjustGlobalHopDepth(session, 10);
        expect(session.globalHopDepth).toBe(4);
    });

    test('dimension hop override inherits global until set', () => {
        const session = createContextSession();
        adjustGlobalHopDepth(session, 1);
        expect(effectiveHopDepth(session, 'current_file')).toBe(2);
        adjustDimensionHopDepth(session, 'manual', 1);
        expect(effectiveHopDepth(session, 'manual')).toBe(3);
        expect(effectiveHopDepth(session, 'open_files')).toBe(2);
    });
});

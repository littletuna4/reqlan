import { describe, expect, test, vi } from 'vitest';
import { StartupGate } from '../src/extension/startup-gate.js';

describe('activity bar startup gate', () => {
    test('resolves once when the first painted frame is signalled', async () => {
        const gate = new StartupGate();
        const ready = vi.fn();
        void gate.ready.then(ready);

        expect(ready).not.toHaveBeenCalled();
        gate.signal();
        await gate.ready;
        expect(ready).toHaveBeenCalledTimes(1);

        gate.signal();
        await Promise.resolve();
        expect(ready).toHaveBeenCalledTimes(1);
    });

    test('falls back when the activity bar stays closed', async () => {
        vi.useFakeTimers();
        try {
            const gate = new StartupGate();
            const ready = vi.fn();
            void gate.waitOrTimeout(3_000).then(ready);

            await vi.advanceTimersByTimeAsync(2_999);
            expect(ready).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(ready).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});

import { describe, expect, test } from 'vitest';
import { isExtensionUpdate, readOnboardingStateForActivation } from '../src/extension/onboarding-state.js';

describe('readOnboardingStateForActivation', () => {
    test('returns fresh state in development mode even when globalState is set', () => {
        const context = {
            extensionMode: 2,
            globalState: {
                get: () => ({ onboardingMessageShown: true, lastVersion: '9.9.9' }),
            },
        };

        expect(readOnboardingStateForActivation(context as never)).toEqual({
            onboardingMessageShown: false,
            lastVersion: '',
        });
    });

    test('reads persisted state in production mode', () => {
        const context = {
            extensionMode: 1,
            globalState: {
                get: () => ({ onboardingMessageShown: true, lastVersion: '1.0.0' }),
            },
        };

        expect(readOnboardingStateForActivation(context as never)).toEqual({
            onboardingMessageShown: true,
            lastVersion: '1.0.0',
        });
    });
});

describe('isExtensionUpdate', () => {
    test('returns false when no prior version is recorded', () => {
        expect(isExtensionUpdate({ onboardingMessageShown: false, lastVersion: '' }, '1.0.1')).toBe(false);
    });

    test('returns false when the version is unchanged', () => {
        expect(
            isExtensionUpdate({ onboardingMessageShown: true, lastVersion: '1.0.1' }, '1.0.1'),
        ).toBe(false);
    });

    test('returns true when the version has changed', () => {
        expect(
            isExtensionUpdate({ onboardingMessageShown: true, lastVersion: '1.0.0' }, '1.0.1'),
        ).toBe(true);
    });
});

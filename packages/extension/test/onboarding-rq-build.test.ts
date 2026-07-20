import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import {
    ONBOARDING_OUTPUT_REL,
    ONBOARDING_TEMPLATE_REL,
    buildOnboardingTemplateValues,
    generateOnboardingRq,
    renderOnboardingRq,
} from '../scripts/onboarding-rq-build.ts';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('onboarding rq build', () => {
    test('renders all template placeholders from phonebook values', () => {
        const template = readFileSync(join(extensionRoot, ONBOARDING_TEMPLATE_REL), 'utf8');
        const rendered = renderOnboardingRq(template);
        const values = buildOnboardingTemplateValues();

        expect(rendered).not.toMatch(/\{\{\w+\}\}/);
        for (const url of Object.values(values)) {
            expect(rendered).toContain(url);
        }
    });

    test('generateOnboardingRq writes the built file under media/', () => {
        const outputPath = generateOnboardingRq(extensionRoot);
        const outputRel = outputPath.slice(extensionRoot.length + 1);

        expect(outputRel).toBe(ONBOARDING_OUTPUT_REL);
        expect(readFileSync(outputPath, 'utf8')).not.toMatch(/\{\{\w+\}\}/);
    });
});

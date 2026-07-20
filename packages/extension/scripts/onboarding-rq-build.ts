import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPhonebookLink } from '../../../scripts/phonebook.ts';
import { renderRqTemplate } from '../src/extension/render-rq-template.ts';

export const ONBOARDING_TEMPLATE_REL = 'templates/thanks-for-installing.template.rq';
export const ONBOARDING_OUTPUT_REL = 'media/thanks-for-installing.rq';

export function buildOnboardingTemplateValues(): Record<string, string> {
    const site = getPhonebookLink('site');
    const quickstartUrl = new URL('quickstart', `${site.href.replace(/\/?$/, '/')}`).href;

    return {
        SITE_URL: site.href,
        GITHUB_URL: getPhonebookLink('github').href,
        QUICKSTART_URL: quickstartUrl,
        VSC_URL: getPhonebookLink('vsc').href,
        OPENVSX_URL: getPhonebookLink('openvsx').href,
    };
}

export function renderOnboardingRq(template: string): string {
    return renderRqTemplate(template, buildOnboardingTemplateValues());
}

export function generateOnboardingRq(extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..')): string {
    const templatePath = join(extensionRoot, ONBOARDING_TEMPLATE_REL);
    const outputPath = join(extensionRoot, ONBOARDING_OUTPUT_REL);
    const rendered = renderOnboardingRq(readFileSync(templatePath, 'utf8'));

    writeFileSync(outputPath, `${rendered.trimEnd()}\n`, 'utf8');
    return outputPath;
}

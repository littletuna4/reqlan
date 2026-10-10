/**
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax.rq".idea_content_tooltip]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ideaContentTooltipEnabled } from '../src/extension/idea-content-tooltip.js';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('idea content tooltip setting', () => {
    test('package.json enables idea content tooltips by default', () => {
        const pkg = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8')) as {
            contributes: {
                configuration: {
                    properties: Record<string, { type: string; default: boolean; description: string }>;
                };
            };
        };
        const setting = pkg.contributes.configuration.properties['reqlan.ideaContentTooltip.enabled'];
        expect(setting).toMatchObject({
            type: 'boolean',
            default: true
        });
        expect(setting?.description.length).toBeGreaterThan(0);
    });

    test('a missing value stays on', () => {
        const configuration = {
            get(_key: 'ideaContentTooltip.enabled', fallback: boolean): boolean {
                return fallback;
            }
        };
        expect(ideaContentTooltipEnabled(configuration)).toBe(true);
    });
});

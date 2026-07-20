import { describe, expect, test } from 'vitest';
import { renderRqTemplate } from '../src/extension/render-rq-template.js';

describe('renderRqTemplate', () => {
    test('replaces placeholders with template values', () => {
        const rendered = renderRqTemplate('Site: {{SITE_URL}}', {
            SITE_URL: 'https://example.com',
        });

        expect(rendered).toBe('Site: https://example.com');
    });

    test('throws when a placeholder is missing', () => {
        expect(() => renderRqTemplate('{{MISSING}}', {})).toThrow(
            'Missing template value for {{MISSING}}',
        );
    });
});

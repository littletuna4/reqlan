import { describe, expect, test } from 'vitest';
import {
    renderRqTemplate,
    tokenizeRq,
} from '../webviews/onboarding/lib/rq-highlight.ts';

describe('onboarding rq highlight', () => {
    test('tokenizes idea names and braces', () => {
        const tokens = tokenizeRq('welcome {\n    Hello\n}');
        const types = tokens.map(token => token.type);
        expect(types).toContain('idea');
        expect(types).toContain('brace');
        expect(types).toContain('body');
    });

    test('extracts clickable url tokens from body prose', () => {
        const tokens = tokenizeRq(
            'resources {\n    - Site: https://example.com/docs\n}',
        );
        const urls = tokens.filter(token => token.type === 'url');
        expect(urls).toEqual([{ type: 'url', text: 'https://example.com/docs' }]);
    });

    test('does not highlight as outside import context', () => {
        const tokens = tokenizeRq('demo {\n    such as this\n}');
        expect(tokens.filter(token => token.type === 'keyword')).toEqual([]);
        expect(tokens.some(token => token.type === 'body' && token.text === 'as')).toBe(true);
    });

    test('highlights as only on import lines', () => {
        const tokens = tokenizeRq('import "./x.rq" as x');
        const keywords = tokens.filter(token => token.type === 'keyword').map(token => token.text);
        expect(keywords).toEqual(['import', 'as']);
    });

    test('highlights @ only at line start', () => {
        const tokens = tokenizeRq(
            'attr {\n    mid-line @not_attr\n    @status done\n}',
        );
        const attributes = tokens
            .filter(token => token.type === 'attribute')
            .map(token => token.text);
        expect(attributes).toEqual(['@status']);
    });

    test('renderRqTemplate fills placeholders used by the onboarding example', () => {
        const rendered = renderRqTemplate('Site: {{SITE_URL}}', {
            SITE_URL: 'https://example.com',
        });
        expect(rendered).toBe('Site: https://example.com');
        expect(rendered).not.toMatch(/\{\{/);
    });
});

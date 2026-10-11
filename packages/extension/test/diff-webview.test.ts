/**
 * rq:["../../../reqlan rq/cli/diff.rq".diff_webview]
 * rq:["../../../reqlan rq/cli/diff.rq".diff_verbosity]
 */
import { describe, expect, test } from 'vitest';
import { diffRowView, type DiffRowInput } from '../src/index_host_module/diff/diff-row-model.js';

const created: DiffRowInput = { change: 'created', name: 'beta', file: 'reqs.rq' };
const references: DiffRowInput = {
    change: 'modified',
    name: 'alpha',
    file: 'reqs.rq',
    references: { added: ['gamma'], removed: ['beta'] }
};
const text: DiffRowInput = {
    change: 'modified',
    name: 'alpha',
    file: 'reqs.rq',
    text: { before: 'one', after: 'two' }
};

describe('diff webview model', () => {
    test('a created row uses the added theme token and hides the body', () => {
        const view = diffRowView(created, 'summary');
        expect(view.change).toBe('created');
        expect(view.name).toBe('beta');
        expect(view.colorToken).toBe('gitDecoration.addedResourceForeground');
        expect(view.before).toBeUndefined();
        expect(view.after).toBeUndefined();
        expect(JSON.stringify(view)).not.toContain('\u001b');
    });

    test('references lists added and removed names and hides the body', () => {
        const view = diffRowView(references, 'references');
        expect(view.added).toEqual(['gamma']);
        expect(view.removed).toEqual(['beta']);
        expect(view.before).toBeUndefined();
        expect(view.after).toBeUndefined();
    });

    test('text shows the before and after body', () => {
        const view = diffRowView(
            { ...text, references: { added: ['gamma'], removed: ['beta'] } },
            'text'
        );
        expect(view.before).toBe('one');
        expect(view.after).toBe('two');
        expect(view.added).toEqual([]);
        expect(view.removed).toEqual([]);
        expect(view.colorToken).toBe('gitDecoration.modifiedResourceForeground');
    });
});

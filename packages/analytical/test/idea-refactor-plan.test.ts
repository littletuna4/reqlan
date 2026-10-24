import { describe, expect, test } from 'vitest';
import { planIdeaDelete, planIdeaMove } from '../src/core/idea-refactor-plan.js';

describe('planIdeaDelete', () => {
    test('returns grouped edits that remove the declaration and a bracket reference', () => {
        const uri = 'file:///tmp/source.rq';
        const source = 'alpha {\n    body\n}\nbeta {\n    see [alpha]\n}\n';
        const planned = planIdeaDelete(uri, source, 'alpha');
        const sourceEdits = planned.find(entry => entry.uri === uri);
        expect(sourceEdits?.edits.length).toBeGreaterThan(0);
        expect(sourceEdits?.edits.every(edit => edit.range.start.line >= 0)).toBe(true);
        expect(sourceEdits?.edits.some(edit => edit.newText === '')).toBe(true);
    });
});

describe('planIdeaMove', () => {
    test('inserts the idea into the destination and rewrites a qualified comment path', () => {
        const sourceUri = 'file:///tmp/a/source.rq';
        const destUri = 'file:///tmp/b/dest.rq';
        const codeUri = 'file:///tmp/src/app.ts';
        const planned = planIdeaMove(
            sourceUri,
            'alpha {\n    body\n}\n',
            destUri,
            'other {\n    keep\n}\n',
            'alpha',
            {
                files: [{
                    uri: codeUri,
                    text: '// rq:["../a/source.rq".alpha]\n'
                }]
            }
        );
        const dest = planned.find(entry => entry.uri === destUri);
        const code = planned.find(entry => entry.uri === codeUri);
        expect(dest?.edits.some(edit => edit.newText.includes('alpha'))).toBe(true);
        expect(code?.edits).toEqual([
            expect.objectContaining({ newText: '"../b/dest.rq"' })
        ]);
    });
});

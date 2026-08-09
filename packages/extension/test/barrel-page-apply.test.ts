/**
 * Barrel page WorkspaceEdit helpers.
 * rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
 * rq:["../../../reqlan rq/extension/features-commands.rq".file_based_code_actions]
 */
import { describe, expect, test } from 'vitest';
import type { BarrelPagePlan } from '@reqlan/analytical';
import {
    defaultBarrelContainerName,
    findBarrelOverwriteConflicts,
    toBarrelApplyPlan
} from '../src/refactor_module/barrel-page-apply.js';

function samplePlan(): BarrelPagePlan {
    return {
        containerName: 'demo',
        containerContent: 'import "./one.rq" as one\n\ndemo {\n    [one.one]\n}\n',
        children: [
            { ideaName: 'one', fileName: 'one.rq', content: 'one {\n    first\n}\n' },
            { ideaName: 'two', fileName: 'two.rq', content: 'two {\n    second\n}\n' }
        ],
        preservedIdeasets: []
    };
}

describe('barrel-page-apply', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
    test('maps child file names next to the source path', () => {
        const apply = toBarrelApplyPlan('/tmp/page/demo.rq', samplePlan());
        expect(apply.containerName).toBe('demo');
        expect(apply.children.map(c => c.absolutePath)).toEqual([
            '/tmp/page/one.rq',
            '/tmp/page/two.rq'
        ]);
        expect(apply.children[0]!.content).toContain('one {');
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
    test('detects overwrite conflicts and source-self collision', () => {
        const apply = toBarrelApplyPlan('/tmp/page/demo.rq', samplePlan());
        expect(findBarrelOverwriteConflicts('/tmp/page/demo.rq', apply, () => false)).toEqual([]);
        expect(
            findBarrelOverwriteConflicts('/tmp/page/demo.rq', apply, path => path.endsWith('one.rq'))
        ).toEqual(['/tmp/page/one.rq']);

        const colliding = toBarrelApplyPlan('/tmp/page/one.rq', {
            ...samplePlan(),
            children: [{ ideaName: 'one', fileName: 'one.rq', content: 'one {}\n' }]
        });
        expect(
            findBarrelOverwriteConflicts('/tmp/page/one.rq', colliding, () => false)
        ).toEqual(['/tmp/page/one.rq']);
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
    test('defaults container name from sanitized basename', () => {
        expect(defaultBarrelContainerName('/tmp/features-page.rq')).toBe('features_page');
    });
});

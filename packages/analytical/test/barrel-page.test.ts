import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
    barrelPage,
    planBarrelPage,
    rewriteSiblingRefs
} from '../src/core/barrel-page.js';

const tempDirs: string[] = [];

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()!;
        rmSync(dir, { recursive: true, force: true });
    }
});

function tempRoot(): string {
    const dir = mkdtempSync(join(tmpdir(), 'reqlan-barrel-'));
    tempDirs.push(dir);
    return dir;
}

describe('rewriteSiblingRefs', () => {
    test('rewrites local sibling refs and skips self, wiki, and non-siblings', () => {
        const siblingNames = new Set(['alpha', 'beta']);
        const { text, neededSiblings } = rewriteSiblingRefs(
            'alpha {\n    see [beta] and [alpha] and [[beta]] and [gamma]\n}',
            'alpha',
            siblingNames
        );
        expect(text).toContain('[beta.beta]');
        expect(text).toContain('[alpha]');
        expect(text).toContain('[[beta]]');
        expect(text).toContain('[gamma]');
        expect(neededSiblings).toEqual(['beta']);
    });
});

describe('planBarrelPage', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
    test('creates one child file per idea and a container defaulting to file basename', async () => {
        const plan = await planBarrelPage(
            `alpha {
    body a
}
beta {
    body b
}
`,
            { sourceFileName: 'features-page.rq' }
        );
        expect(plan.containerName).toBe('features_page');
        expect(plan.children.map(c => c.ideaName)).toEqual(['alpha', 'beta']);
        expect(plan.containerContent).toContain('import "./alpha.rq" as alpha');
        expect(plan.containerContent).toContain('import "./beta.rq" as beta');
        expect(plan.containerContent).toContain('features_page {');
        expect(plan.containerContent).toContain('[alpha.alpha]');
        expect(plan.containerContent).toContain('[beta.beta]');
        expect(plan.children[0]!.content).toContain('alpha {');
        expect(plan.children[1]!.content).toContain('beta {');
    });

    test('uses explicit container name and rewrites sibling refs in children', async () => {
        const plan = await planBarrelPage(
            `alpha {
    depends on [beta]
}
beta {
    leaf
}
`,
            { containerName: 'bundle' }
        );
        expect(plan.containerName).toBe('bundle');
        const alpha = plan.children.find(c => c.ideaName === 'alpha')!;
        expect(alpha.content).toContain('import "./beta.rq" as beta');
        expect(alpha.content).toContain('[beta.beta]');
        expect(alpha.content).not.toMatch(/(?<!\.)\[beta\]/);
    });

    test('copies existing imports into child files', async () => {
        const plan = await planBarrelPage(
            `import "./shared.rq" as shared

alpha {
    uses [shared.helper]
}
beta {
    other
}
`,
            { containerName: 'page' }
        );
        expect(plan.children[0]!.content).toContain('import "./shared.rq" as shared');
        expect(plan.children[1]!.content).toContain('import "./shared.rq" as shared');
        expect(plan.containerContent).not.toContain('shared.rq');
    });

    test('preserves top-level ideasets in the container file', async () => {
        const plan = await planBarrelPage(
            `alpha {
    a
}

bundle_set (
    alpha
)
`,
            { containerName: 'page' }
        );
        expect(plan.preservedIdeasets.length).toBe(1);
        expect(plan.containerContent).toContain('bundle_set (');
        expect(plan.containerContent).toContain('alpha');
    });

    test('rejects empty idea pages and container name clashes', async () => {
        await expect(planBarrelPage('import "./x.rq" as x\n')).rejects.toThrow(/at least one top-level idea/i);
        await expect(
            planBarrelPage(`alpha {\n    a\n}\n`, { containerName: 'alpha' })
        ).rejects.toThrow(/conflicts with an idea/i);
    });
});

describe('barrelPage', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
    test('writes child files and replaces the source with a container', async () => {
        const root = tempRoot();
        const sourcePath = join(root, 'demo.rq');
        writeFileSync(
            sourcePath,
            `one {
    first
}
two {
    second
}
`,
            'utf8'
        );

        const result = await barrelPage(sourcePath, { containerName: 'demo' });
        expect(result.dryRun).toBe(false);
        expect(existsSync(join(root, 'one.rq'))).toBe(true);
        expect(existsSync(join(root, 'two.rq'))).toBe(true);
        expect(readFileSync(sourcePath, 'utf8')).toContain('demo {');
        expect(readFileSync(join(root, 'one.rq'), 'utf8')).toContain('one {');
    });

    test('dryRun does not write files', async () => {
        const root = tempRoot();
        const sourcePath = join(root, 'demo.rq');
        const original = `one {\n    first\n}\ntwo {\n    second\n}\n`;
        writeFileSync(sourcePath, original, 'utf8');

        const result = await barrelPage(sourcePath, { dryRun: true, containerName: 'demo' });
        expect(result.dryRun).toBe(true);
        expect(existsSync(join(root, 'one.rq'))).toBe(false);
        expect(readFileSync(sourcePath, 'utf8')).toBe(original);
    });

    test('refuses to overwrite an existing child file', async () => {
        const root = tempRoot();
        const sourcePath = join(root, 'demo.rq');
        writeFileSync(sourcePath, `one {\n    first\n}\n`, 'utf8');
        writeFileSync(join(root, 'one.rq'), 'already\n', 'utf8');
        await expect(barrelPage(sourcePath, { containerName: 'demo' })).rejects.toThrow(/overwrite existing/i);
    });
});

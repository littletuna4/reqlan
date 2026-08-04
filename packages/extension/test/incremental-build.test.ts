import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { cacheStatus, fingerprint } from '../scripts/build.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true }))
    );
});

describe('incremental extension build cache', () => {
    test('requires both inputs and outputs to match their cached content', async () => {
        const root = await mkdtemp(join(tmpdir(), 'reqlan-build-cache-'));
        temporaryDirectories.push(root);
        const input = join(root, 'input.ts');
        const output = join(root, 'output.js');
        await writeFile(input, 'input-v1');
        await writeFile(output, 'output-v1');

        const step = {
            command: 'example-build',
            inputs: [input],
            outputs: [output]
        };
        const cached = {
            inputHash: await fingerprint(step.inputs, step.command),
            outputHash: await fingerprint(step.outputs, step.command)
        };

        await expect(cacheStatus(step, cached)).resolves.toMatchObject({ fresh: true });

        await writeFile(output, 'manually-changed');
        await expect(cacheStatus(step, cached)).resolves.toMatchObject({ fresh: false });

        await writeFile(output, 'output-v1');
        await writeFile(input, 'input-v2');
        await expect(cacheStatus(step, cached)).resolves.toMatchObject({ fresh: false });
    });
});

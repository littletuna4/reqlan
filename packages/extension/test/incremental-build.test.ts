import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

    test('ignores node_modules when fingerprinting a directory tree', async () => {
        const root = await mkdtemp(join(tmpdir(), 'reqlan-build-nm-'));
        temporaryDirectories.push(root);
        const source = join(root, 'main.ts');
        const viteTempDir = join(root, 'node_modules', '.vite-temp');
        await writeFile(source, 'source-v1');
        await mkdir(viteTempDir, { recursive: true });
        await writeFile(join(viteTempDir, 'vite.config.ts.timestamp-1.mjs'), 'ephemeral');

        const withoutTemp = await fingerprint([root], 'webview-build');
        await writeFile(join(viteTempDir, 'vite.config.ts.timestamp-2.mjs'), 'also-ephemeral');
        const withExtraTemp = await fingerprint([root], 'webview-build');
        expect(withExtraTemp).toBe(withoutTemp);

        await writeFile(source, 'source-v2');
        await expect(fingerprint([root], 'webview-build')).resolves.not.toBe(withoutTemp);
    });
});

/**
 * @reqlan/analytical must not publish until every platform package is deployed.
 * rq:["../../../reqlan rq/distribution/distribution.rq".npm_distribution]
 * rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { NATIVE_TARGETS } from '../../../scripts/native-targets.mjs';
import {
    missingNativePackages,
    parseArg,
    readReadyNames,
    requireNativesPublished
} from '../../../scripts/require-natives-published.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('require natives published', () => {
    // rq:["../../../reqlan rq/distribution/distribution.rq".npm_distribution]
    test('parseArg reads --ready-file', () => {
        expect(parseArg(['--ready-file', 'artifacts/natives-ready.txt'], '--ready-file')).toBe(
            'artifacts/natives-ready.txt'
        );
        expect(parseArg(['--ready-file=artifacts/natives-ready.txt'], '--ready-file')).toBe(
            'artifacts/natives-ready.txt'
        );
        expect(parseArg([], '--ready-file')).toBeUndefined();
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
    test('readReadyNames loads package names and ignores a missing file', () => {
        expect(readReadyNames(undefined).size).toBe(0);
        expect(readReadyNames('').size).toBe(0);
        expect(readReadyNames(join(root, 'does-not-exist-natives-ready.txt')).size).toBe(0);

        const dir = mkdtempSync(join(tmpdir(), 'reqlan-natives-ready-'));
        const readyFile = join(dir, 'natives-ready.txt');
        writeFileSync(
            readyFile,
            `${NATIVE_TARGETS[0].packageName}\n\n${NATIVE_TARGETS[1].packageName}\n`,
            'utf8'
        );
        expect(readReadyNames(readyFile)).toEqual(
            new Set([NATIVE_TARGETS[0].packageName, NATIVE_TARGETS[1].packageName])
        );
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".npm_distribution]
    test('ready-file names skip the registry lookup', async () => {
        const readyNames = new Set(NATIVE_TARGETS.map((target) => target.packageName));
        const missing = await missingNativePackages({
            targets: NATIVE_TARGETS,
            version: '1.0.0',
            readyNames,
            versionExists: async () => {
                throw new Error('registry must not be queried when every native is ready');
            }
        });
        expect(missing).toEqual([]);
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".npm_distribution]
    test('reports natives that are not ready and not on the registry', async () => {
        const missingName = NATIVE_TARGETS[2].packageName;
        const missing = await missingNativePackages({
            targets: NATIVE_TARGETS,
            version: '9.9.9',
            readyNames: new Set(),
            versionExists: async (name) => name !== missingName
        });
        expect(missing).toEqual([`${missingName}@9.9.9`]);
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".npm_distribution]
    test('requireNativesPublished refuses when any native is missing', async () => {
        const result = await requireNativesPublished({
            argv: [],
            version: '9.9.9',
            versionExists: async () => false
        });
        expect(result.status).toBe(1);
        expect(result.message).toContain('Refuse @reqlan/analytical@9.9.9');
        for (const target of NATIVE_TARGETS) {
            expect(result.message).toContain(`${target.packageName}@9.9.9`);
        }
    });

    // rq:["../../../reqlan rq/distribution/distribution.rq".npm_distribution]
    test('CLI exits 0 when the ready-file lists every native', () => {
        const dir = mkdtempSync(join(tmpdir(), 'reqlan-natives-ready-'));
        const readyFile = join(dir, 'natives-ready.txt');
        writeFileSync(
            readyFile,
            NATIVE_TARGETS.map((target) => target.packageName).join('\n') + '\n',
            'utf8'
        );
        const result = spawnSync(
            process.execPath,
            [join(root, 'scripts/require-natives-published.mjs'), '--ready-file', readyFile],
            { cwd: root, encoding: 'utf8' }
        );
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('natives ready for @reqlan/analytical@');
    });
});

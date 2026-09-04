/**
 * Refresh / create-base host wiring must call analytical BaseRegistry.refresh.
 * rq:["../../../reqlan rq/bases/base.rq".refresh_rediscovers_bases]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_manual]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexService = readFileSync(
    join(here, '../src/analytical_submodule/index-store/index-service.ts'),
    'utf8'
);
const registerCommands = readFileSync(
    join(here, '../src/analytical_submodule/commands/register-commands.ts'),
    'utf8'
);

describe('refresh rediscovers bases (extension wiring)', () => {
    test('IndexService.syncWorkspace calls registry.refresh', () => {
        expect(indexService).toContain('async syncWorkspace');
        expect(indexService).toMatch(/syncWorkspace[\s\S]*registry\.refresh\(/);
        expect(indexService).toContain('refresh_rediscovers_bases');
    });

    test('IndexService.createBase calls createBase then registry.refresh', () => {
        expect(indexService).toContain('async createBase');
        expect(indexService).toMatch(/createBaseMarker\([\s\S]*registry\.refresh\(/);
    });

    test('reqlan.refreshIndex command uses syncWorkspace', () => {
        expect(registerCommands).toContain("reqlan.refreshIndex");
        expect(registerCommands).toContain('index.syncWorkspace()');
    });
});

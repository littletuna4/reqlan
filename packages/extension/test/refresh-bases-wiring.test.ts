/**
 * Separate refresh-bases vs refresh-index host wiring.
 * rq:["../../../reqlan rq/bases/base.rq".refresh_bases_pass]
 * rq:["../../../reqlan rq/bases/base.rq".refresh_bases_on_load]
 * rq:["../../../reqlan rq/bases/base.rq".refresh_index_separate]
 * rq:["../../../reqlan rq/bases/base.rq".select_base_dialog]
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
const selectBaseDialog = readFileSync(
    join(here, '../src/analytical_submodule/commands/select-base-dialog.ts'),
    'utf8'
);
const basePicker = readFileSync(
    join(here, '../webviews/activity-bar/components/BasePicker.svelte'),
    'utf8'
);
const packageJson = readFileSync(join(here, '../package.json'), 'utf8');

describe('refresh bases wiring (extension)', () => {
    test('IndexService.refreshBases calls registry.refreshBases', () => {
        expect(indexService).toContain('async refreshBases');
        expect(indexService).toMatch(/refreshBases\([\s\S]*registry\.refreshBases\(/);
        expect(indexService).toContain('refresh_bases_pass');
    });

    test('IndexService.syncWorkspace does not call registry.refreshBases', () => {
        expect(indexService).toContain('async syncWorkspace');
        expect(indexService).toContain('refresh_index_separate');
        const syncMatch = indexService.match(/async syncWorkspace[\s\S]*?^    async /m);
        expect(syncMatch?.[0] ?? '').not.toContain('registry.refreshBases');
        expect(syncMatch?.[0] ?? '').not.toContain('registry.refresh(');
        expect(syncMatch?.[0] ?? '').toContain('registry.syncBase');
    });

    test('IndexService.activate schedules refreshBases', () => {
        expect(indexService).toContain('refresh_bases_on_load');
        expect(indexService).toMatch(/async activate[\s\S]*void this\.refreshBases\(\)/);
    });

    test('IndexService.createBase calls createBase then refreshBases', () => {
        expect(indexService).toContain('async createBase');
        expect(indexService).toMatch(/createBaseMarker\([\s\S]*this\.refreshBases\(/);
    });

    test('reqlan.refreshIndex command uses syncWorkspace', () => {
        expect(registerCommands).toContain("reqlan.refreshIndex");
        expect(registerCommands).toContain('index.syncWorkspace()');
    });

    test('reqlan.refreshBases command is registered', () => {
        expect(registerCommands).toContain("reqlan.refreshBases");
        expect(registerCommands).toContain('index.refreshBases()');
        expect(packageJson).toContain('"reqlan.refreshBases"');
    });

    test('reqlan.selectBase command is registered', () => {
        expect(registerCommands).toContain("reqlan.selectBase");
        expect(registerCommands).toContain('showSelectBaseDialog');
        expect(packageJson).toContain('"reqlan.selectBase"');
        expect(selectBaseDialog).toContain('showQuickPick');
        expect(selectBaseDialog).toContain('select_base_dialog');
    });

    test('BasePicker posts openSelectBaseDialog and refreshBases', () => {
        expect(basePicker).toContain('onOpenDialog');
        expect(basePicker).toContain('onRefreshBases');
        expect(basePicker).toContain('Refresh bases');
        expect(basePicker).toContain('aria-haspopup="dialog"');
    });
});

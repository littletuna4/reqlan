/**
 * rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
 * rq:["../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { Cli, Builtins } from 'clipanion';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParseCommand } from './commands/parse.js';
import { AnalyseCommand } from './commands/analyse.js';
import { SearchCommand } from './commands/search.js';
import { ClickCommand } from './commands/click.js';
import { ExportCommand } from './commands/export.js';
import { InitCommand } from './commands/init.js';
import { BarrelCommand } from './commands/barrel.js';
import { CheckCommand } from './commands/check.js';
import { argvForClipanion } from './argv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')) as {
    version: string;
};

const cli = new Cli({
    binaryLabel: 'reqlan',
    binaryName: 'reqlan',
    binaryVersion: packageJson.version
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(ParseCommand);
cli.register(AnalyseCommand);
cli.register(SearchCommand);
cli.register(ClickCommand);
cli.register(ExportCommand);
cli.register(InitCommand);
cli.register(BarrelCommand);
cli.register(CheckCommand);

await cli.runExit(argvForClipanion(process.argv.slice(2)));

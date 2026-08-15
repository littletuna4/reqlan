import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import { emit } from '../output.js';

/**
 * rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
 */
export class BarrelCommand extends Command {
    static override paths = [['barrel']];

    static override usage = Command.Usage({
        description:
            'Barrel a large .rq page into a container that imports one file per top-level idea.',
        details: `
            Creates one sibling .rq file per top-level idea, then replaces the source file
            with namespace imports and a container idea (default name: sanitized file basename).
        `,
        examples: [
            ['Barrel the current file', '$0 barrel ./path/to/page.rq'],
            ['Choose the container idea name', '$0 barrel ./page.rq --name features'],
            ['Plan without writing', '$0 barrel ./page.rq --dry-run --json']
        ]
    });

    file = Option.String({ required: true });
    name = Option.String('--name', {
        description: 'Container idea name (default: sanitized file basename)'
    });
    dryRun = Option.Boolean('--dry-run', false, {
        description: 'Compute the barrel plan without writing files'
    });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });

    async execute(): Promise<number> {
        try {
            const { barrelPage } = await import('@reqlan/analytical');
            const result = await barrelPage(resolve(this.file), {
                containerName: this.name,
                dryRun: this.dryRun
            });
            const payload = {
                ok: true,
                dryRun: result.dryRun,
                sourcePath: result.sourcePath,
                containerName: result.containerName,
                createdPaths: result.createdPaths,
                children: result.children.map(child => ({
                    ideaName: child.ideaName,
                    fileName: child.fileName
                }))
            };
            if (this.json) {
                emit(payload, true);
            } else if (result.dryRun) {
                this.context.stdout.write(
                    `Dry run: would barrel ${result.sourcePath} into container "${result.containerName}" with ${result.children.length} child file(s)\n`
                );
                for (const child of result.children) {
                    this.context.stdout.write(`  - ${child.fileName} (${child.ideaName})\n`);
                }
            } else {
                this.context.stdout.write(
                    `Barreled ${result.sourcePath} into container "${result.containerName}"\n`
                );
                for (const path of result.createdPaths) {
                    this.context.stdout.write(`  wrote ${path}\n`);
                }
            }
            return 0;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}

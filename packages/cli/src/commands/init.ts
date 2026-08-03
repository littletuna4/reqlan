import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import { createBase } from '@reqlan/analytical';
import { emit } from '../output.js';

export class InitCommand extends Command {
    static override paths = [['init']];

    static override usage = Command.Usage({
        description: 'Initialise a reqlan base by creating a `.reqlan` marker directory.',
        details: `
            Creates <directory>/.reqlan/ (empty directory is a valid base marker).
            Idempotent: if the marker already exists, exits successfully and reports that.
        `,
        examples: [
            ['Init the current directory', '$0 init'],
            ['Init a specific folder', '$0 init ./my-project'],
            ['JSON output', '$0 init --json']
        ]
    });

    directory = Option.String({ required: false });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });

    async execute(): Promise<number> {
        try {
            const root = resolve(this.directory ?? process.cwd());
            const result = await createBase(root);
            const payload = {
                ok: true,
                created: result.created,
                root: result.base.root,
                memoryPath: result.base.memoryPath,
                label: result.base.label
            };
            if (this.json) {
                emit(payload, true);
            } else if (result.created) {
                this.context.stdout.write(
                    `Initialized reqlan base at ${result.base.root}\n` +
                        `Marker: ${result.base.memoryPath}\n`
                );
            } else {
                this.context.stdout.write(
                    `Reqlan base already exists at ${result.base.root}\n` +
                        `Marker: ${result.base.memoryPath}\n`
                );
            }
            return 0;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}

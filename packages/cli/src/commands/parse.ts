import { Command, Option } from 'clipanion';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parseReqlanSource } from '@reqlan/analytical/core';
import { emit } from '../output.js';

export class ParseCommand extends Command {
    static override paths = [['parse']];

    static override usage = Command.Usage({
        description: 'Parse a .rq file and print diagnostics or an AST summary.',
        examples: [
            ['Parse a requirement file', '$0 parse ./path/to/file.rq'],
            ['JSON output', '$0 parse ./path/to/file.rq --json']
        ]
    });

    file = Option.String({ required: true });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });

    async execute(): Promise<number> {
        try {
            if (extname(this.file) !== '.rq') {
                throw new Error('Please choose a file with one of these extensions: .rq.');
            }
            if (!existsSync(this.file)) {
                throw new Error(`File ${this.file} does not exist.`);
            }

            const source = readFileSync(resolve(this.file), 'utf8');
            const parsed = parseReqlanSource(source);
            const payload = {
                file: this.file,
                ok: parsed.ok,
                errorCount: parsed.errorCount,
                diagnostics: parsed.diagnostics,
                elements: parsed.elements
            };

            if (this.json) {
                emit(payload, true);
            } else if (parsed.errorCount > 0) {
                this.context.stderr.write('There are validation errors:\n');
                for (const diagnostic of parsed.diagnostics.filter(item => item.severity === 1)) {
                    this.context.stderr.write(
                        `line ${diagnostic.line}: ${diagnostic.message} [${diagnostic.text}]\n`
                    );
                }
            } else {
                const lines = parsed.elements.map(element =>
                    element.name ? `${element.type} ${element.name}` : element.type
                );
                this.context.stdout.write(
                    `Parsed ${this.file}: ${lines.length} top-level element(s)\n` +
                        (lines.length > 0 ? lines.map(line => `  - ${line}`).join('\n') + '\n' : '')
                );
            }

            return parsed.errorCount > 0 ? 1 : 0;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}

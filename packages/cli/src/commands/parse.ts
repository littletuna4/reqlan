import { Command, Option } from 'clipanion';
import { createReqlanServices, type Model } from '@reqlan/language';
import { NodeFileSystem } from 'langium/node';
import { parseDocument } from '../util.js';
import { emit } from '../output.js';

function elementSummary(model: Model): Array<{ type: string; name?: string }> {
    return model.elements.map(element => ({
        type: element.$type,
        name: 'name' in element ? element.name : undefined
    }));
}

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
        const services = createReqlanServices(NodeFileSystem).Reqlan;
        try {
            const { document, diagnostics, errorCount } = await parseDocument(this.file, services);
            const model = document.parseResult?.value as Model | undefined;
            const payload = {
                file: this.file,
                ok: errorCount === 0,
                errorCount,
                diagnostics,
                elements: model ? elementSummary(model) : []
            };

            if (this.json) {
                emit(payload, true);
            } else if (errorCount > 0) {
                this.context.stderr.write('There are validation errors:\n');
                for (const d of diagnostics.filter(x => x.severity === 1)) {
                    this.context.stderr.write(`line ${d.line}: ${d.message} [${d.text}]\n`);
                }
            } else {
                const lines = payload.elements.map(el =>
                    el.name ? `${el.type} ${el.name}` : el.type
                );
                this.context.stdout.write(
                    `Parsed ${this.file}: ${lines.length} top-level element(s)\n` +
                        (lines.length > 0 ? lines.map(l => `  - ${l}`).join('\n') + '\n' : '')
                );
            }

            return errorCount > 0 ? 1 : 0;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}

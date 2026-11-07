/**
 * rq:["../../../../reqlan rq/core_analysis/rope.rq".rope]
 * rq:["../../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { Command, Option } from 'clipanion';
import { withAnalysisApi } from '../runtime.js';
import { emit } from '../output.js';
import type { RopeTuning } from '@reqlan/analytical/core';

function optionalU32(raw: string | undefined): number | undefined {
    if (!raw) {
        return undefined;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

function optionalTuning(raw: string | undefined): RopeTuning | undefined {
    if (!raw) {
        return undefined;
    }
    switch (raw) {
        case 'default':
        case 'focused':
        case 'exploratory':
        case 'deep':
            return raw;
        default:
            throw new Error('--tuning must be default, focused, exploratory, or deep');
    }
}

export class RopeCommand extends Command {
    static override paths = [['rope']];

    static override usage = Command.Usage({
        description:
            'Return compact local context for a target idea, respecting cardinality, fray, and click-session deduplication.',
        details: `
            Target may be an idea name, path#idea, .rq file, or indexed code file.
            No match uses search. More than one match is ranked by session distance.
            A unique match lists idea content, outbound, backlinks, and siblings (no edges).
            Always pass the returned sessionKey on the next click in the same flow.
        `,
        examples: [
            ['Click an idea', '$0 rope alpha'],
            ['Continue a session', '$0 rope beta --session clk-abc'],
            ['File target', '$0 rope graph.rq --fray 3'],
        ]
    });

    target = Option.String({ required: true });
    fray = Option.String('--fray', {
        description: 'Number of adjacent ideas to include (default: 2)',
    });
    tuning = Option.String('--tuning', {
        description: 'Tuning mode: default, focused, exploratory, deep',
    });
    session = Option.String('--session', {
        description: 'Click session key from a prior click'
    });
    cwd = Option.String('--cwd', {
        description: 'Workspace root (default: walk from cwd, or REQLAN_WORKSPACE)'
    });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });

    async execute(): Promise<number> {
        try {
            await withAnalysisApi(this.cwd, async api => {
                const result = await api.rope(this.target, {
                    sessionKey: this.session,
                    fray: optionalU32(this.fray),
                    tuning: optionalTuning(this.tuning)
                });
                if (this.json) {
                    emit(result, true);
                    return;
                }
                emit(api.formatClickResult(result), false);
            });
            return 0;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}

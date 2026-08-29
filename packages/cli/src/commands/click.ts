/**
 * rq:["../../../../reqlan rq/cli/click.rq".click]
 * rq:["../../../../reqlan rq/cli/click.rq".agent_advisory]
 * rq:["../../../../reqlan rq/cli/click.rq".click_max_detail]
 * rq:["../../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { Command, Option } from 'clipanion';
import { withAnalysisApi } from '../runtime.js';
import { emit } from '../output.js';

function optionalU32(raw: string | undefined): number | undefined {
    if (!raw) {
        return undefined;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

export class ClickCommand extends Command {
    static override paths = [['click']];

    static override usage = Command.Usage({
        description:
            'Return unique idea or file context, ranked matches, or search hits. Pass --session on later calls.',
        details: `
            Target may be an idea name, path#idea, .rq file, or indexed code file.
            No match uses search. More than one match is ranked by session distance.
            A unique match lists idea content, outbound, backlinks, and siblings (no edges).
            Always pass the returned sessionKey on the next click in the same flow.
        `,
        examples: [
            ['Click an idea', '$0 click alpha'],
            ['Continue a session', '$0 click beta --session clk-abc'],
            ['File target', '$0 click graph.rq --json']
        ]
    });

    target = Option.String({ required: true });
    session = Option.String('--session', {
        description: 'Click session key from a prior click'
    });
    maxDetail = Option.String('--max-detail', {
        description: 'Deprecated hop-depth flag; ignored on the unique path'
    });
    maxBacklinks = Option.String('--max-backlinks', {
        description: 'Max backlink names (default 8)'
    });
    maxSiblings = Option.String('--max-siblings', {
        description: 'Max sibling names (default 8)'
    });
    maxOutbound = Option.String('--max-outbound', {
        description: 'Max outbound names (default 8)'
    });
    maxCandidates = Option.String('--max-candidates', {
        description: 'Max search hits and ranked ambiguous matches (default 8)'
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
                const result = await api.click(this.target, {
                    sessionKey: this.session,
                    maxDetail: optionalU32(this.maxDetail),
                    maxBacklinks: optionalU32(this.maxBacklinks),
                    maxSiblings: optionalU32(this.maxSiblings),
                    maxOutbound: optionalU32(this.maxOutbound),
                    maxCandidates: optionalU32(this.maxCandidates)
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

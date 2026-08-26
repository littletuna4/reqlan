/**
 * rq:["../../../../reqlan rq/cli/click.rq".click]
 * rq:["../../../../reqlan rq/cli/click.rq".agent_advisory]
 * rq:["../../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { Command, Option } from 'clipanion';
import { withAnalysisApi } from '../runtime.js';
import { emit } from '../output.js';

export class ClickCommand extends Command {
    static override paths = [['click']];

    static override usage = Command.Usage({
        description:
            'Return closest ideas for a target. Pass --session on later calls to avoid resurfacing.',
        details: `
            Target may be an idea name, path#idea, .rq file, or other indexed path.
            Optional --max-detail sets hop depth (default 1).
            Always pass the returned sessionKey on the next click in the same flow.
        `,
        examples: [
            ['Click an idea', '$0 click alpha'],
            ['Continue a session', '$0 click beta --session clk-abc'],
            ['File target with depth', '$0 click graph.rq --max-detail 2 --json']
        ]
    });

    target = Option.String({ required: true });
    session = Option.String('--session', {
        description: 'Click session key from a prior click (prevents resurfacing)'
    });
    maxDetail = Option.String('--max-detail', '1', {
        description: 'Hop depth for closest ideas (default 1)'
    });
    cwd = Option.String('--cwd', {
        description: 'Workspace root (default: walk from cwd, or REQLAN_WORKSPACE)'
    });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });

    async execute(): Promise<number> {
        const maxDetail = Number.parseInt(this.maxDetail, 10);
        try {
            await withAnalysisApi(this.cwd, async api => {
                const result = await api.click(this.target, {
                    sessionKey: this.session,
                    maxDetail: Number.isFinite(maxDetail) && maxDetail > 0 ? maxDetail : 1
                });
                if (this.json) {
                    emit(result, true);
                    return;
                }
                const centers =
                    result.centers.length > 0
                        ? result.centers.map(idea => api.formatIdea(idea)).join('\n\n')
                        : '(none)';
                const nodes =
                    result.nodes.length > 0
                        ? result.nodes.map(idea => api.formatIdea(idea)).join('\n\n')
                        : '(none)';
                const edges =
                    result.edges.length > 0
                        ? result.edges
                              .map(
                                  edge =>
                                      `${edge.sourceId} -[${edge.kind}]-> ${edge.targetId ?? edge.targetFile ?? '?'}`
                              )
                              .join('\n')
                        : '(none)';
                const body = [
                    `sessionKey: ${result.sessionKey}`,
                    `depth: ${result.depth}`,
                    `suppressedCount: ${result.suppressedCount}`,
                    '',
                    '## Centers',
                    centers,
                    '',
                    '## Closest ideas',
                    nodes,
                    '',
                    '## Edges',
                    edges,
                    '',
                    'Pass --session with this sessionKey on the next click to avoid resurfacing.'
                ].join('\n');
                emit(body, false);
            });
            return 0;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}

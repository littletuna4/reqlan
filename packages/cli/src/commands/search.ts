import { Command, Option } from 'clipanion';
import { withAnalysisApi } from '../runtime.js';
import { emit } from '../output.js';

export class SearchCommand extends Command {
    static override paths = [['search']];

    static override usage = Command.Usage({
        description: 'Search requirements by keyword across names, summaries, tags, and references.',
        examples: [
            ['Search ideas', '$0 search "cli package"'],
            ['Limit results', '$0 search parse --limit 5 --json'],
            [
                'Bias by context',
                '$0 search ranking --context "reqlan rq/core_analysis/search.rq" --context fuzzy_search'
            ]
        ]
    });

    query = Option.String({ required: true });
    limit = Option.String('--limit', '8', {
        description: 'Maximum number of matches (default 8)'
    });
    contextRefs = Option.Array('--context', {
        description:
            'Relative .rq path, path#idea, or idea name that biases ranking by graph hop distance (repeatable)'
    });
    cwd = Option.String('--cwd', {
        description: 'Workspace root (default: walk from cwd, or REQLAN_WORKSPACE)'
    });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });

    async execute(): Promise<number> {
        const limit = Number.parseInt(this.limit, 10);
        try {
            await withAnalysisApi(this.cwd, async api => {
                const matches = await api.searchRequirements(
                    this.query,
                    Number.isFinite(limit) && limit > 0 ? limit : 8,
                    this.contextRefs?.length ? { context: this.contextRefs } : undefined
                );
                if (this.json) {
                    emit(
                        matches.map(match => ({
                            idea: match.idea,
                            score: match.score,
                            reasons: match.reasons
                        })),
                        true
                    );
                    return;
                }
                if (matches.length === 0) {
                    this.context.stdout.write(`No requirements matched "${this.query}".\n`);
                    return;
                }
                const body = matches
                    .map(match => {
                        const reasons = match.reasons?.length ? `\nReasons: ${match.reasons.join(', ')}` : '';
                        const score = match.score !== undefined ? `\nScore: ${match.score}` : '';
                        return `${api.formatIdea(match.idea)}${score}${reasons}`;
                    })
                    .join('\n\n');
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

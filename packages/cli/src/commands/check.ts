/**
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
 * rq:["../../../../reqlan rq/cli/cli_package.rq".commands]
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
import { Command, Option } from 'clipanion';
import { withAnalysisApi } from '../runtime.js';
import { emit } from '../output.js';
import { formatCheckIssues, formatCheckPipe } from '../format-broken-refs.js';

const HANDLING_VALUES = 'warn, error, or off';

function parseHandling(flag: string, value: string): string | undefined {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'warn' || normalised === 'warning' || normalised === 'error' || normalised === 'off') {
        return normalised === 'warning' ? 'warn' : normalised;
    }
    return undefined;
}

export class CheckCommand extends Command {
    static override paths = [['check']];

    static override usage = Command.Usage({
        description: 'Check that requirement, comment, and code references resolve.',
        details: `
            Wraps the ideas index and reports unresolved idea references, comment
            references, and missing code files. Lines after //rq-ignore-error are skipped.
            Issues are ordered by the missing target so shared broken refs group together.
            Wildcard references that match 0 ideas use --wildcard-zero (default warn).
            Wildcard references that match 1 idea use --wildcard-one (default warn).
            Each flag is warn, error, or off.
            Exit status is 1 when the command finds issues.
            Use --json or --pipe for machine output.
        `,
        examples: [
            ['Check the workspace', '$0 check'],
            ['JSON output', '$0 check --json'],
            ['Pipe output', '$0 check --pipe'],
            ['Limit to a path glob', '$0 check --glob "reqlan rq/**"'],
            ['Treat empty wildcards as errors', '$0 check --wildcard-zero error'],
            ['Skip singleton-wildcard warnings', '$0 check --wildcard-one off']
        ]
    });

    glob = Option.String('--glob', {
        description: 'Optional path glob that limits the check to a subset of the base'
    });
    cwd = Option.String('--cwd', {
        description: 'Workspace root (default: walk from cwd, or REQLAN_WORKSPACE)'
    });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });
    pipe = Option.Boolean('--pipe', false, {
        description: 'Emit one issue per line for pipes'
    });
    wildcardZero = Option.String('--wildcard-zero', 'warn', {
        description: `How to handle a wildcard that matches 0 ideas (${HANDLING_VALUES})`
    });
    wildcardOne = Option.String('--wildcard-one', 'warn', {
        description: `How to handle a wildcard that matches 1 idea (${HANDLING_VALUES})`
    });

    async execute(): Promise<number> {
        if (this.json && this.pipe) {
            this.context.stderr.write('Specify only one of --json or --pipe.\n');
            return 1;
        }
        const wildcardZero = parseHandling('--wildcard-zero', this.wildcardZero);
        if (!wildcardZero) {
            this.context.stderr.write(`--wildcard-zero must be ${HANDLING_VALUES}.\n`);
            return 1;
        }
        const wildcardOne = parseHandling('--wildcard-one', this.wildcardOne);
        if (!wildcardOne) {
            this.context.stderr.write(`--wildcard-one must be ${HANDLING_VALUES}.\n`);
            return 1;
        }

        try {
            return await withAnalysisApi(this.cwd, async api => {
                const rows = await api.check({
                    pathGlob: this.glob,
                    wildcardZero,
                    wildcardOne
                });
                if (this.json) {
                    emit(rows, true);
                } else if (this.pipe) {
                    const body = formatCheckPipe(rows);
                    if (body.length > 0) {
                        emit(body, false);
                    }
                } else {
                    emit(formatCheckIssues(rows), false);
                }
                return rows.length > 0 ? 1 : 0;
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}

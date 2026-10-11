/**
 * rq:["../../../../reqlan rq/cli/diff.rq".diff]
 * rq:["../../../../reqlan rq/cli/diff.rq".diff_verbosity]
 * rq:["../../../../reqlan rq/cli/diff.rq".diff_cli_color]
 * rq:["../../../../reqlan rq/cli/cli_package.rq".commands]
 */
import { Command, Option } from 'clipanion';
import { emit } from '../output.js';
import { withAnalysisApi } from '../runtime.js';
import {
    formatDiff,
    formatDiffHeader,
    parseDiffVerbosity,
    plainDiffRows,
    useDiffColor,
    type DiffRow
} from '../format-diff.js';

interface DiffResult {
    from: string;
    to: string;
    implicit: boolean;
    rows: DiffRow[];
}

export class DiffCommand extends Command {
    static override paths = [['diff']];

    static override usage = Command.Usage({
        description: 'Compare ideas between two git revisions.',
        details: `
            No arguments compare pending .rq edits with HEAD.
            When no .rq path is staged, unstaged, or untracked, the command compares HEAD~1 with HEAD.
            One revision compares that revision with HEAD.
            --verbosity is summary (default), references, or text. -v is references. -vv is text.
            Color follows the terminal. NO_COLOR disables it. --color and --no-color override that.
        `,
        examples: [
            ['Pending edits, or the last commit', '$0 diff'],
            ['One revision against HEAD', '$0 diff HEAD~1'],
            ['Two revisions', '$0 diff main feature'],
            ['Reference names', '$0 diff --verbosity references'],
            ['Body text', '$0 diff -vv'],
            ['JSON', '$0 diff --json']
        ]
    });

    cwd = Option.String('--cwd', {
        description: 'Workspace root (default: walk from cwd, or REQLAN_WORKSPACE)'
    });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });
    color = Option.Boolean('--color', false, {
        description: 'Force colored text'
    });
    noColor = Option.Boolean('--no-color', false, {
        description: 'Force plain text'
    });
    verbosity = Option.String('--verbosity', {
        description: 'summary, references, or text'
    });
    verbose = Option.Boolean('-v', false, {
        description: 'References verbosity'
    });
    veryVerbose = Option.Boolean('-vv', false, {
        description: 'Text verbosity'
    });
    revisions = Option.Rest({ name: 'revision' });

    async execute(): Promise<number> {
        const revisions = (this.revisions ?? []).filter(revision => revision.trim().length > 0);
        if (revisions.length > 2) {
            this.context.stderr.write('diff accepts at most two revisions.\n');
            return 2;
        }
        // Clipanion 3 treats `-vv` as `-v` twice; detect the token so `-vv` is text.
        const veryVerbose = this.veryVerbose || process.argv.includes('-vv');
        const verbosity = parseDiffVerbosity(this.verbosity, this.verbose, veryVerbose);
        if (!verbosity) {
            this.context.stderr.write('--verbosity must be summary, references, or text.\n');
            return 2;
        }
        const from = revisions[0];
        const to = revisions[1];
        try {
            return await withAnalysisApi(this.cwd, async api => {
                const result = (await api.diffIdeas(from, to, verbosity)) as DiffResult;
                if (this.json) {
                    emit(plainDiffRows(result.rows), true);
                    return 0;
                }
                const colored = useDiffColor({
                    color: this.color,
                    noColor: this.noColor,
                    json: false,
                    noColorEnv: Boolean(process.env.NO_COLOR),
                    isTTY: Boolean(process.stdout.isTTY)
                });
                const header = result.implicit ? formatDiffHeader(result.from, result.to) : undefined;
                const text = formatDiff(result.rows, colored, header);
                if (text.length > 0) {
                    emit(text, false);
                }
                return 0;
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 2;
        }
    }
}

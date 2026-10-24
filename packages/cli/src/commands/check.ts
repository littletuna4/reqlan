/**
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
 * rq:["../../../../reqlan rq/cli/cli_package.rq".commands]
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 * rq:["../../../../reqlan rq/core_analysis/check.rq".code_comment_syntax_errors]
 */
import { Command, Option } from 'clipanion';
import type { SparseWildcardHandling } from '@reqlan/analytical/core';
import { withAnalysisApi } from '../runtime.js';
import { emit } from '../output.js';
import { formatCheckIssues, formatCheckPipe } from '../format-broken-refs.js';

const HANDLING_VALUES = 'warn, error, or off';

function parseHandling(value: string): SparseWildcardHandling | undefined {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'warn' || normalised === 'warning') {
        return 'warn';
    }
    if (normalised === 'error' || normalised === 'off') {
        return normalised;
    }
    return undefined;
}

export class CheckCommand extends Command {
    static override paths = [['check']];

    static override usage = Command.Usage({
        description: 'Check that requirement, comment, import, and code references resolve.',
        details: `
            Wraps the ideas index and reports unresolved idea references, comment
            references, missing code files, and unresolved imports. A malformed rq: comment reference is an error.
            Lines after //rq-ignore-error are skipped.
            Issues are ordered by the missing target so shared broken refs group together.
            Wildcard references that match 0 ideas use --wildcard-zero (default warn).
            Wildcard references that match 1 idea use --wildcard-one (default warn).
            Each flag is warn, error, or off.
            Repeat --glob <pattern> to scan files that match any pattern.
            One --glob selects the same files as before.
            A reference target outside every glob is still checked.
            The command does not walk a directory that matches no glob.
            A positional file outside the globs is checked as that file.
            A positional directory outside the globs is not walked.
            Repeat --skip-target <glob> to omit issues whose missing target matches a glob.
            --skip-gitignored-targets omits missing file targets that Git ignore rules ignore.
            Exit status is 1 when the command finds issues.
            Use --json or --pipe for machine output.
        `,
        examples: [
            ['Check the workspace', '$0 check'],
            ['JSON output', '$0 check --json'],
            ['Pipe output', '$0 check --pipe'],
            ['Limit to a path glob', '$0 check --glob "reqlan rq/**"'],
            ['Use two globs', '$0 check --glob "src/**" --glob "reqs/**"'],
            ['Check one file outside the globs', '$0 check --glob "src/**" notes/extra.rq'],
            ['Treat empty wildcards as errors', '$0 check --wildcard-zero error'],
            ['Skip singleton-wildcard warnings', '$0 check --wildcard-one off'],
            ['Skip gitignored Cursor paths', '$0 check --skip-target "**/.cursor/**"'],
            ['Skip gitignored file targets', '$0 check --skip-gitignored-targets']
        ]
    });

    globs = Option.Array('--glob', {
        description: 'Path glob for the recursive scan. Repeat to include another pattern.'
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
    unusedImports = Option.String('--unused-imports', 'off', {
        description: `How to handle unused imports (${HANDLING_VALUES})`
    });
    skipTargets = Option.Array('--skip-target', {
        description: 'Omit issues whose missing target matches this glob (repeatable)'
    });
    skipGitignoredTargets = Option.Boolean('--skip-gitignored-targets', false, {
        description: 'Omit file-reference issues whose missing target is gitignored'
    });
    pathArgs = Option.Rest({ name: 'path' });

    async execute(): Promise<number> {
        if (this.json && this.pipe) {
            this.context.stderr.write('Specify only one of --json or --pipe.\n');
            return 1;
        }
        const globs = this.globs ?? [];
        if (globs.some(glob => glob.trim().length === 0)) {
            this.context.stderr.write('Each --glob value must be a non-empty path glob.\n');
            return 1;
        }
        const paths = (this.pathArgs ?? []).filter(path => path.trim().length > 0);

        const wildcardZero = parseHandling(this.wildcardZero);
        if (!wildcardZero) {
            this.context.stderr.write(`--wildcard-zero must be ${HANDLING_VALUES}.\n`);
            return 1;
        }
        const wildcardOne = parseHandling(this.wildcardOne);
        if (!wildcardOne) {
            this.context.stderr.write(`--wildcard-one must be ${HANDLING_VALUES}.\n`);
            return 1;
        }
        const unusedImports = parseHandling(this.unusedImports);
        if (!unusedImports) {
            this.context.stderr.write(`--unused-imports must be ${HANDLING_VALUES}.\n`);
            return 1;
        }

        try {
            return await withAnalysisApi(this.cwd, async api => {
                const rows = await api.check({
                    pathGlobs: globs.length > 0 ? globs : undefined,
                    paths: paths.length > 0 ? paths : undefined,
                    wildcardZero,
                    wildcardOne,
                    skipTargets: this.skipTargets,
                    skipGitignoredTargets: this.skipGitignoredTargets,
                    unusedImports
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

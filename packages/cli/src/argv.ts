/**
 * rq:["../../../reqlan rq/cli/cli_package.rq".pnpm_extra_args]
 *
 * Drop a lone `--` that package managers insert between the script and extra args.
 * `pnpm run check -- --skip-target glob` becomes `reqlan check -- --skip-target glob`.
 * Clipanion treats `--` as end of options, so `--skip-target` would then be a command.
 */
export function argvForClipanion(argv: string[]): string[] {
    return argv.filter(arg => arg !== '--');
}

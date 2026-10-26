/**
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_verbose]
 */
import type { CheckReport, CheckSyncFileEvent } from '@reqlan/analytical/core';

export type CheckVerbosity = 0 | 1 | 2 | 3;

/**
 * Clipanion 3 collapses `-vv` / `-vvv` into repeated `-v`; detect the tokens.
 */
export function parseCheckVerbosity(
    argv: readonly string[],
    verbose: boolean,
    veryVerbose: boolean,
    debugVerbose: boolean
): CheckVerbosity {
    if (argv.includes('-vvv') || debugVerbose) {
        return 3;
    }
    if (argv.includes('-vv') || veryVerbose) {
        return 2;
    }
    if (verbose) {
        return 1;
    }
    return 0;
}

export function formatCheckVerbose(report: CheckReport, verbosity: CheckVerbosity): string {
    if (verbosity < 1) {
        return '';
    }
    const lines: string[] = [];
    const sync = report.sync;
    lines.push(`check: index=${report.indexMode}`);
    lines.push(
        `check: sync indexed=${sync.indexed} skipped_mtime=${sync.skippedMtime} errors=${sync.errors} processed=${sync.processed}/${sync.total}`
    );
    if (verbosity >= 2) {
        for (const event of report.files) {
            lines.push(formatFileEvent(event, verbosity >= 3));
        }
    }
    lines.push(`check: issues=${report.issues.length}`);
    return `${lines.join('\n')}\n`;
}

function formatFileEvent(event: CheckSyncFileEvent, withDetail: boolean): string {
    if (withDetail && event.detail) {
        return `check: ${event.action} ${event.file} (${event.detail})`;
    }
    return `check: ${event.action} ${event.file}`;
}

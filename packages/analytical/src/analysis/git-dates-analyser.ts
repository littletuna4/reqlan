/**
 * Surfaces creation / last-modified dates and change count for ideas via git history.
 * Persists into the ideas index for silent background fill, Timeline, and Ideas table.
 *
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
 * rq:["../../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
 * rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
 * rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
 */
import { URI } from 'langium';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Analyser } from './analyser-registry.js';
import { resolveWorkspaceFileUri } from '../core/workspace-paths.js';

const execFileAsync = promisify(execFile);

const GIT_LOG_TIMEOUT_MS = 4_000;
/** Keep background indexing gentle on the extension host. */
const LOOKUP_CONCURRENCY = 2;

/** git `%aI` author-date lines (ignore patch hunks if --no-patch is ignored). */
const ISO_AUTHOR_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Extract ISO author-date lines from git log stdout (defensive against patch noise). */
export function parseGitAuthorDates(stdout: string): string[] {
    return stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => ISO_AUTHOR_DATE.test(line));
}

export interface GitDateInfo {
    ideaId: string;
    createdAt?: string;
    modifiedAt?: string;
    changeCount?: number;
}

export const gitDatesAnalyser: Analyser<{ ideaIds?: string[] }, GitDateInfo[]> = {
    id: 'git_dates',
    async run({ store, workspaceRoot }, { ideaIds }) {
        const wanted = ideaIds ? new Set(ideaIds) : undefined;
        const ideas = (await store.getAllIdeasRaw()).filter(idea => {
            if (idea.kind === 'ideaset') {
                return false;
            }
            return wanted ? wanted.has(idea.id) : true;
        });
        const results: GitDateInfo[] = [];

        for (let offset = 0; offset < ideas.length; offset += LOOKUP_CONCURRENCY) {
            const batch = ideas.slice(offset, offset + LOOKUP_CONCURRENCY);
            const batchResults = await Promise.all(batch.map(async idea => {
                const dates = await lookupGitDates(
                    idea.fileUri,
                    idea.lineStart,
                    idea.lineEnd,
                    workspaceRoot
                );
                if (dates.createdAt || dates.modifiedAt || dates.changeCount !== undefined) {
                    await store.updateGitDates(
                        idea.id,
                        dates.createdAt,
                        dates.modifiedAt,
                        dates.changeCount
                    );
                }
                return { ideaId: idea.id, ...dates };
            }));
            results.push(...batchResults);
        }
        return results;
    }
};

async function lookupGitDates(
    fileUri: string,
    lineStart: number,
    lineEnd: number,
    workspaceRoot?: string
): Promise<{ createdAt?: string; modifiedAt?: string; changeCount?: number }> {
    const resolvedUri = resolveWorkspaceFileUri(fileUri, workspaceRoot);
    const filePath = resolvedUri.startsWith('file://') ? URI.parse(resolvedUri).fsPath : resolvedUri;
    const cwd = workspaceRoot;
    const start = Math.min(lineStart, lineEnd) + 1;
    const end = Math.max(lineStart, lineEnd) + 1;

    try {
        const { stdout: lineStdout } = await execFileAsync(
            'git',
            ['log', '-L', `${start},${end}:${filePath}`, '--format=%aI', '--no-patch'],
            { cwd, timeout: GIT_LOG_TIMEOUT_MS }
        );
        const lineDates = parseGitAuthorDates(lineStdout);
        if (lineDates.length > 0) {
            return {
                modifiedAt: lineDates[0],
                createdAt: lineDates[lineDates.length - 1],
                changeCount: lineDates.length
            };
        }
    } catch {
        // Fall through to file-level dates.
    }

    try {
        const { stdout: createdStdout } = await execFileAsync(
            'git',
            ['log', '--follow', '--diff-filter=A', '--format=%aI', '-1', '--', filePath],
            { cwd, timeout: GIT_LOG_TIMEOUT_MS }
        );
        const { stdout: modifiedStdout } = await execFileAsync(
            'git',
            ['log', '--follow', '--format=%aI', '-1', '--', filePath],
            { cwd, timeout: GIT_LOG_TIMEOUT_MS }
        );
        const { stdout: countStdout } = await execFileAsync(
            'git',
            ['log', '--follow', '--format=%H', '--', filePath],
            { cwd, timeout: GIT_LOG_TIMEOUT_MS }
        );
        const createdAt = parseGitAuthorDates(createdStdout)[0];
        const modifiedAt = parseGitAuthorDates(modifiedStdout)[0];
        const changeCount = countStdout
            .trim()
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean).length;
        if (!createdAt && !modifiedAt && changeCount === 0) {
            return {};
        }
        return {
            createdAt,
            modifiedAt,
            changeCount: changeCount > 0 ? changeCount : undefined
        };
    } catch {
        return {};
    }
}

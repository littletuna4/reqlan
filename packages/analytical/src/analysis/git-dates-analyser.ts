/**
 * Surfaces creation and last-modified dates for ideas via git history.
 * Persists into the ideas index for silent background fill and Timeline consumers.
 *
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
 * rq:["../../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
 * rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
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

export interface GitDateInfo {
    ideaId: string;
    createdAt?: string;
    modifiedAt?: string;
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
                if (dates.createdAt || dates.modifiedAt) {
                    await store.updateGitDates(idea.id, dates.createdAt, dates.modifiedAt);
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
): Promise<{ createdAt?: string; modifiedAt?: string }> {
    const resolvedUri = resolveWorkspaceFileUri(fileUri, workspaceRoot);
    const filePath = resolvedUri.startsWith('file://') ? URI.parse(resolvedUri).fsPath : resolvedUri;
    const cwd = workspaceRoot;
    const start = Math.min(lineStart, lineEnd) + 1;
    const end = Math.max(lineStart, lineEnd) + 1;

    try {
        const { stdout: lineStdout } = await execFileAsync(
            'git',
            ['log', '-L', `${start},${end}:${filePath}`, '--format=%aI', '-n', '40'],
            { cwd, timeout: GIT_LOG_TIMEOUT_MS }
        );
        const lineDates = lineStdout
            .trim()
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
        if (lineDates.length > 0) {
            return {
                modifiedAt: lineDates[0],
                createdAt: lineDates[lineDates.length - 1]
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
        return {
            createdAt: createdStdout.trim() || undefined,
            modifiedAt: modifiedStdout.trim() || undefined
        };
    } catch {
        return {};
    }
}

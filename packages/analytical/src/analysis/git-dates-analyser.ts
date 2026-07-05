import { URI } from 'langium';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Analyser } from './analyser-registry.js';
import { resolveWorkspaceFileUri } from '../core/workspace-paths.js';

const execFileAsync = promisify(execFile);

export interface GitDateInfo {
    ideaId: string;
    createdAt?: string;
    modifiedAt?: string;
}

export const gitDatesAnalyser: Analyser<{ ideaIds?: string[] }, GitDateInfo[]> = {
    id: 'git_dates',
    async run({ store, workspaceRoot }, { ideaIds }) {
        const ideas = ideaIds
            ? (await Promise.all(ideaIds.map(id => store.getIdea(id)))).filter((idea): idea is NonNullable<typeof idea> => !!idea)
            : await store.listAllIdeas();
        const results: GitDateInfo[] = [];
        for (const idea of ideas) {
            const dates = await lookupGitDates(idea.fileUri, idea.lineStart + 1, workspaceRoot);
            if (dates.createdAt || dates.modifiedAt) {
                await store.updateGitDates(idea.id, dates.createdAt, dates.modifiedAt);
            }
            results.push({ ideaId: idea.id, ...dates });
        }
        return results;
    }
};

async function lookupGitDates(
    fileUri: string,
    line: number,
    workspaceRoot?: string
): Promise<{ createdAt?: string; modifiedAt?: string }> {
    const resolvedUri = resolveWorkspaceFileUri(fileUri, workspaceRoot);
    const filePath = resolvedUri.startsWith('file://') ? URI.parse(resolvedUri).fsPath : resolvedUri;
    const cwd = workspaceRoot;
    try {
        const { stdout: createdStdout } = await execFileAsync(
            'git',
            ['log', '--diff-filter=A', '--format=%aI', '-1', '--', filePath],
            { cwd }
        );
        const { stdout: modifiedStdout } = await execFileAsync(
            'git',
            ['log', '-L', `${line},${line}:${filePath}`, '--format=%aI', '-1'],
            { cwd }
        );
        return {
            createdAt: createdStdout.trim() || undefined,
            modifiedAt: modifiedStdout.trim() || undefined
        };
    } catch {
        return {};
    }
}

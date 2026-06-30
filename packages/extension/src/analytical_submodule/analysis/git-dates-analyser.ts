import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Analyser } from './analyser-registry.js';

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
            ? ideaIds.map(id => store.getIdea(id)).filter((idea): idea is NonNullable<typeof idea> => !!idea)
            : store.listAllIdeas();
        const results: GitDateInfo[] = [];
        for (const idea of ideas) {
            const dates = await lookupGitDates(idea.fileUri, idea.lineStart + 1, workspaceRoot);
            if (dates.createdAt || dates.modifiedAt) {
                store.updateGitDates(idea.id, dates.createdAt, dates.modifiedAt);
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
    const filePath = fileUri.replace(/^file:\/\//, '');
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

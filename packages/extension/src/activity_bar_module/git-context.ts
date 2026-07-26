import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { URI } from 'langium';
import type {
    ContextFileEntry,
    GitAuthorRollup,
    GitContextSlice,
    GitFocusCommit
} from 'reqlan-analytical';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import {
    buildGitSummary,
    buildHistoryCue,
    parseGitLogRecords,
    rollupAuthors
} from './git-context-helpers.js';

export {
    buildGitSummary,
    buildHistoryCue,
    formatRelativeAge,
    parseGitLogRecords,
    rollupAuthors
} from './git-context-helpers.js';

const execFileAsync = promisify(execFile);

const FOCUS_COMMIT_LIMIT = 8;
const HISTORY_CACHE_TTL_MS = 60_000;
const GIT_LOG_TIMEOUT_MS = 4_000;

interface GitApiRepository {
    state: {
        HEAD?: { name?: string; commit?: string };
        indexChanges: Array<{ uri: vscode.Uri }>;
        workingTreeChanges: Array<{ uri: vscode.Uri }>;
    };
}

interface GitExtensionApi {
    repositories: GitApiRepository[];
}

export interface CollectGitContextOptions {
    relativePath: (uri: string) => string;
    workspaceRoot?: string;
    focusFileUri: string;
    /** 0-based inclusive line start for idea-scoped history. */
    lineStart?: number;
    /** 0-based inclusive line end for idea-scoped history. */
    lineEnd?: number;
    /** Prefer `git log -L` when a line range is available (`.rq` ideas). */
    useLineHistory?: boolean;
}

interface HistoryCacheEntry {
    commits: GitFocusCommit[];
    authors: GitAuthorRollup[];
    at: number;
}

const historyCache = new Map<string, HistoryCacheEntry>();

/** Clear focus-history cache (tests). */
export function clearGitHistoryCache(): void {
    historyCache.clear();
}

export async function collectGitContext(
    options: CollectGitContextOptions
): Promise<GitContextSlice | undefined> {
    const gitExtension = vscode.extensions.getExtension<{ getAPI(version: number): GitExtensionApi }>('vscode.git');
    const api = gitExtension?.exports?.getAPI(1);
    const repo = api?.repositories[0];
    const workspaceRoot = options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const stagedUris = new Set(
        (repo?.state.indexChanges ?? []).map(change => toIndexFileUri(change.uri))
    );
    const unstagedUris = new Set(
        (repo?.state.workingTreeChanges ?? []).map(change => toIndexFileUri(change.uri))
    );
    const allUris = new Set([...stagedUris, ...unstagedUris]);
    const changedFiles: ContextFileEntry[] = [];

    for (const fileUri of allUris) {
        const staged = stagedUris.has(fileUri);
        const unstaged = unstagedUris.has(fileUri);
        changedFiles.push({
            fileUri,
            fileLabel: options.relativePath(fileUri),
            gitChange: staged && unstaged ? 'both' : staged ? 'staged' : 'unstaged',
            sources: ['git']
        });
    }

    const branch = repo?.state.HEAD?.name;
    const headCommit = repo?.state.HEAD?.commit;
    const headShort = headCommit ? headCommit.slice(0, 7) : undefined;

    // No VS Code git repo and no workspace root → nothing useful to show.
    if (!repo && !workspaceRoot) {
        return undefined;
    }

    const history = await loadFocusHistory(options, workspaceRoot);
    const summary = buildGitSummary({
        branch,
        headShort,
        commits: history.commits,
        authors: history.authors,
        dirtyCount: stagedUris.size + unstagedUris.size
    });
    const historyCue = buildHistoryCue({
        branch,
        commits: history.commits
    });

    return {
        branch,
        headShort,
        stagedCount: stagedUris.size,
        unstagedCount: unstagedUris.size,
        changedFiles,
        focusCommits: history.commits,
        topAuthors: history.authors,
        summary,
        historyCue
    };
}

export function gitChangeForFile(
    fileUri: string,
    git?: GitContextSlice
): 'staged' | 'unstaged' | 'both' | undefined {
    return git?.changedFiles.find(entry => entry.fileUri === fileUri)?.gitChange;
}

async function loadFocusHistory(
    options: CollectGitContextOptions,
    workspaceRoot?: string
): Promise<{ commits: GitFocusCommit[]; authors: GitAuthorRollup[] }> {
    if (!workspaceRoot || !options.focusFileUri) {
        return { commits: [], authors: [] };
    }

    const cacheKey = [
        options.focusFileUri,
        options.lineStart ?? '',
        options.lineEnd ?? '',
        options.useLineHistory ? 'L' : 'P'
    ].join('|');
    const cached = historyCache.get(cacheKey);
    if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL_MS) {
        return { commits: cached.commits, authors: cached.authors };
    }

    const filePath = fileUriToFsPath(options.focusFileUri, workspaceRoot);
    let commits: GitFocusCommit[] = [];

    if (
        options.useLineHistory &&
        options.lineStart !== undefined &&
        options.lineEnd !== undefined
    ) {
        const start = Math.min(options.lineStart, options.lineEnd) + 1;
        const end = Math.max(options.lineStart, options.lineEnd) + 1;
        commits = await runGitLog(
            [
                'log',
                `-n${FOCUS_COMMIT_LIMIT}`,
                '-L',
                `${start},${end}:${filePath}`,
                `--format=${logFormat()}`
            ],
            workspaceRoot
        );
    }

    if (commits.length === 0) {
        commits = await runGitLog(
            [
                'log',
                `-n${FOCUS_COMMIT_LIMIT}`,
                '--follow',
                `--format=${logFormat()}`,
                '--',
                filePath
            ],
            workspaceRoot
        );
    }

    const authors = rollupAuthors(commits);
    historyCache.set(cacheKey, { commits, authors, at: Date.now() });
    return { commits, authors };
}

function logFormat(): string {
    return '%H%x00%h%x00%s%x00%an%x00%aI';
}

async function runGitLog(args: string[], cwd: string): Promise<GitFocusCommit[]> {
    try {
        const { stdout } = await execFileAsync('git', args, {
            cwd,
            timeout: GIT_LOG_TIMEOUT_MS,
            maxBuffer: 512 * 1024
        });
        return parseGitLogRecords(stdout);
    } catch {
        return [];
    }
}

function fileUriToFsPath(fileUri: string, workspaceRoot: string): string {
    if (fileUri.startsWith('file://')) {
        return URI.parse(fileUri).fsPath;
    }
    return path.isAbsolute(fileUri)
        ? fileUri
        : path.resolve(workspaceRoot, fileUri.replace(/^\/+/, ''));
}

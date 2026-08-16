import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fsPathFromFileUri } from '@reqlan/analytical';
import { extractIdeaNames } from '@reqlan/analytical/core';
import type {
    ContextFileEntry,
    GitAuthorRollup,
    GitContextSlice,
    GitFocusCommit,
    GitFocusStats
} from './lib/context-model.js';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import {
    buildGitSummary,
    buildHistoryCue,
    parseGitLogRecords,
    rollupAuthors,
    shouldRefreshGitFocusCache
} from './git-context-helpers.js';

export {
    buildGitSummary,
    buildHistoryCue,
    formatRelativeAge,
    parseGitLogRecords,
    rollupAuthors,
    shouldRefreshGitFocusCache
} from './git-context-helpers.js';

const execFileAsync = promisify(execFile);

const FOCUS_COMMIT_LIMIT = 8;
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
    /**
     * When false, skip `git log -L` / focus stats (first context paint).
     * Default true for deferred enrichment.
     */
    includeFocusHistory?: boolean;
    focusIdea?: {
        id: string;
        name: string;
        lineStart: number;
        lineEnd: number;
    };
    peerIdeas?: Array<{
        id: string;
        name: string;
        lineStart: number;
        lineEnd: number;
    }>;
}

interface HistoryCacheEntry {
    commits: GitFocusCommit[];
    authors: GitAuthorRollup[];
    at: number;
}

interface StatsCacheEntry {
    stats?: GitFocusStats;
    at: number;
}

interface RepoCommitMeta {
    hash: string;
    author: string;
    authoredAt: string;
}

const historyCache = new Map<string, HistoryCacheEntry>();
const statsCache = new Map<string, StatsCacheEntry>();
const repoRootCache = new Map<string, string | undefined>();
const headAuthoredAtCache = new Map<string, { hash: string; authoredAtMs: number }>();
const ideaPresenceCache = new Map<string, Set<string>>();
const rangeCommitCountCache = new Map<string, { count: number; at: number }>();

/** Clear focus-history cache (tests). */
export function clearGitHistoryCache(): void {
    historyCache.clear();
    statsCache.clear();
    repoRootCache.clear();
    headAuthoredAtCache.clear();
    ideaPresenceCache.clear();
    rangeCommitCountCache.clear();
}

export async function collectGitContext(
    options: CollectGitContextOptions
): Promise<GitContextSlice | undefined> {
    const gitExtension = vscode.extensions.getExtension<{ getAPI(version: number): GitExtensionApi }>('vscode.git');
    const api = gitExtension?.exports?.getAPI(1);
    const repo = api?.repositories[0];
    const workspaceRoot = options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const stagedUris = new Set(
        (repo?.state.indexChanges ?? []).map(change => toIndexFileUri(change.uri, workspaceRoot))
    );
    const unstagedUris = new Set(
        (repo?.state.workingTreeChanges ?? []).map(change => toIndexFileUri(change.uri, workspaceRoot))
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

    const dirtyCount = stagedUris.size + unstagedUris.size;
    const includeFocusHistory = options.includeFocusHistory !== false;
    if (!includeFocusHistory) {
        return {
            branch,
            headShort,
            stagedCount: stagedUris.size,
            unstagedCount: unstagedUris.size,
            changedFiles,
            focusCommits: [],
            topAuthors: [],
            focusStats: undefined,
            summary: buildGitSummary({
                branch,
                headShort,
                commits: [],
                authors: [],
                dirtyCount
            }),
            historyCue: buildHistoryCue({ branch, commits: [] })
        };
    }

    const history = await loadFocusHistory(options, workspaceRoot);
    const focusStats = await loadFocusStats(options, workspaceRoot, history.commits);
    const summary = buildGitSummary({
        branch,
        headShort,
        commits: history.commits,
        authors: history.authors,
        dirtyCount
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
        focusStats,
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
    const latestCommitMs = await getHeadAuthoredAtMs(workspaceRoot);
    if (cached && !shouldRefreshGitFocusCache(cached.at, latestCommitMs)) {
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
                '--no-patch',
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
                '--no-patch',
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

async function loadFocusStats(
    options: CollectGitContextOptions,
    workspaceRoot: string | undefined,
    focusCommits: GitFocusCommit[]
): Promise<GitFocusStats | undefined> {
    if (!workspaceRoot) {
        return undefined;
    }
    const cacheKey = [
        options.focusFileUri,
        options.focusIdea?.id ?? '',
        options.peerIdeas?.map(idea => `${idea.id}:${idea.lineStart}-${idea.lineEnd}`).join(',') ?? ''
    ].join('|');
    const cached = statsCache.get(cacheKey);
    const latestCommitMs = await getHeadAuthoredAtMs(workspaceRoot);
    if (cached && !shouldRefreshGitFocusCache(cached.at, latestCommitMs)) {
        return cached.stats;
    }

    const filePath = fileUriToFsPath(options.focusFileUri, workspaceRoot);
    const repoRoot = await resolveRepoRoot(workspaceRoot);
    if (!repoRoot) {
        return undefined;
    }
    const repoPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    if (!repoPath || repoPath.startsWith('..')) {
        return undefined;
    }

    let stats: GitFocusStats | undefined;
    if (options.focusIdea) {
        stats = await buildIdeaFocusStats({
            repoRoot,
            repoPath,
            focusIdea: options.focusIdea,
            peerIdeas: options.peerIdeas ?? [],
            focusCommits
        });
    } else if (focusCommits.length > 0) {
        stats = {
            modifiedAt: focusCommits[0]?.authoredAt,
            modifiedBy: focusCommits[0]?.author,
            commitCount: focusCommits.length
        };
    }

    statsCache.set(cacheKey, { stats, at: Date.now() });
    return stats;
}

async function buildIdeaFocusStats(input: {
    repoRoot: string;
    repoPath: string;
    focusIdea: NonNullable<CollectGitContextOptions['focusIdea']>;
    peerIdeas: NonNullable<CollectGitContextOptions['peerIdeas']>;
    focusCommits: GitFocusCommit[];
}): Promise<GitFocusStats | undefined> {
    const fileHistory = await loadFileCommitMeta(input.repoRoot, input.repoPath);
    if (fileHistory.length === 0) {
        return undefined;
    }

    const lifecycle = await locateIdeaLifecycle(input.repoRoot, input.repoPath, input.focusIdea.name, fileHistory);
    const peerRates = await Promise.all(
        input.peerIdeas.map(peer =>
            buildPeerChangeRate(input.repoRoot, input.repoPath, peer, fileHistory)
        )
    );

    const focusPeer = peerRates.find(peer => peer.ideaId === input.focusIdea.id);
    const focusCommitCount =
        focusPeer?.commitCount ??
        (input.focusCommits.length > 0
            ? await countRangeCommits(
                  input.repoRoot,
                  absoluteRepoPath(input.repoRoot, input.repoPath),
                  input.focusIdea.lineStart,
                  input.focusIdea.lineEnd
              )
            : 0);
    const createdAt = lifecycle?.createdAt;
    const ageDays = wholeDaysSince(createdAt);
    const changeRate = focusCommitCount / Math.max(ageDays ?? 1, 1);
    const peerMedian = median(
        peerRates
            .filter(peer => peer.ideaId !== input.focusIdea.id)
            .map(peer => peer.changeRate ?? 0)
            .filter(value => value > 0)
    );
    const relativeChangeRate =
        peerMedian && Number.isFinite(peerMedian) && peerMedian > 0
            ? changeRate / peerMedian
            : undefined;

    return {
        symbolName: input.focusIdea.name,
        createdAt,
        createdBy: lifecycle?.createdBy,
        modifiedAt: input.focusCommits[0]?.authoredAt ?? fileHistory[0]?.authoredAt,
        modifiedBy: input.focusCommits[0]?.author ?? fileHistory[0]?.author,
        commitCount: focusCommitCount,
        ageDays,
        changeRate,
        relativeChangeRate,
        relativeChangeLabel: relativeChangeLabel(relativeChangeRate),
        peers: peerRates
    };
}

async function buildPeerChangeRate(
    repoRoot: string,
    repoPath: string,
    peer: NonNullable<CollectGitContextOptions['peerIdeas']>[number],
    fileHistory: RepoCommitMeta[]
): Promise<NonNullable<GitFocusStats['peers']>[number]> {
    const lifecycle = await locateIdeaLifecycle(repoRoot, repoPath, peer.name, fileHistory);
    const commitCount = await countRangeCommits(
        repoRoot,
        absoluteRepoPath(repoRoot, repoPath),
        peer.lineStart,
        peer.lineEnd
    );
    const ageDays = wholeDaysSince(lifecycle?.createdAt);
    return {
        ideaId: peer.id,
        name: peer.name,
        commitCount,
        ageDays,
        changeRate: commitCount / Math.max(ageDays ?? 1, 1)
    };
}

async function loadFileCommitMeta(repoRoot: string, repoPath: string): Promise<RepoCommitMeta[]> {
    const stdout = await runGitText(
        ['log', '--follow', '--no-patch', '--format=%H%x00%an%x00%aI', '--', repoPath],
        repoRoot
    );
    if (!stdout) {
        return [];
    }
    return stdout
        .trim()
        .split('\n')
        .map(line => {
            const [hash, author, authoredAt] = line.split('\0');
            return hash
                ? {
                      hash,
                      author: author || 'unknown',
                      authoredAt: authoredAt || ''
                  }
                : undefined;
        })
        .filter((entry): entry is RepoCommitMeta => !!entry);
}

async function locateIdeaLifecycle(
    repoRoot: string,
    repoPath: string,
    ideaName: string,
    history: RepoCommitMeta[]
): Promise<{ createdAt?: string; createdBy?: string } | undefined> {
    const oldestFirst = [...history].reverse();
    for (const commit of oldestFirst) {
        const ideaNames = await loadIdeaNamesAtRevision(repoRoot, repoPath, commit.hash);
        if (ideaNames.has(ideaName)) {
            return {
                createdAt: commit.authoredAt || undefined,
                createdBy: commit.author || undefined
            };
        }
    }
    return undefined;
}

async function loadIdeaNamesAtRevision(
    repoRoot: string,
    repoPath: string,
    hash: string
): Promise<Set<string>> {
    const cacheKey = `${repoRoot}|${repoPath}|${hash}`;
    const cached = ideaPresenceCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const text = await runGitText(['show', `${hash}:${repoPath}`], repoRoot, 1024 * 1024);
    if (!text) {
        const empty = new Set<string>();
        ideaPresenceCache.set(cacheKey, empty);
        return empty;
    }
    try {
        const names = new Set(extractIdeaNames(text));
        ideaPresenceCache.set(cacheKey, names);
        return names;
    } catch {
        const empty = new Set<string>();
        ideaPresenceCache.set(cacheKey, empty);
        return empty;
    }
}

async function countRangeCommits(
    repoRoot: string,
    filePath: string,
    lineStart: number,
    lineEnd: number
): Promise<number> {
    const cacheKey = `${repoRoot}|${filePath}|${lineStart}|${lineEnd}`;
    const cached = rangeCommitCountCache.get(cacheKey);
    const latestCommitMs = await getHeadAuthoredAtMs(repoRoot);
    if (cached && !shouldRefreshGitFocusCache(cached.at, latestCommitMs)) {
        return cached.count;
    }
    const start = Math.min(lineStart, lineEnd) + 1;
    const end = Math.max(lineStart, lineEnd) + 1;
    const stdout = await runGitText(
        ['log', '--no-patch', '-L', `${start},${end}:${filePath}`, '--format=%H'],
        repoRoot
    );
    const count = stdout
        ? stdout
              .trim()
              .split('\n')
              .map(line => line.trim())
              .filter(Boolean).length
        : 0;
    rangeCommitCountCache.set(cacheKey, { count, at: Date.now() });
    return count;
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
        return fsPathFromFileUri(fileUri);
    }
    return path.isAbsolute(fileUri)
        ? fileUri
        : path.resolve(workspaceRoot, fileUri.replace(/^\/+/, ''));
}

async function resolveRepoRoot(cwd: string): Promise<string | undefined> {
    if (repoRootCache.has(cwd)) {
        return repoRootCache.get(cwd);
    }
    const root = (await runGitText(['rev-parse', '--show-toplevel'], cwd))?.trim() || undefined;
    repoRootCache.set(cwd, root);
    return root;
}

/** HEAD authored-at in ms; re-reads when HEAD hash changes. */
async function getHeadAuthoredAtMs(cwd: string): Promise<number | undefined> {
    const hash = (await runGitText(['rev-parse', 'HEAD'], cwd))?.trim();
    if (!hash) {
        return undefined;
    }
    const cached = headAuthoredAtCache.get(cwd);
    if (cached?.hash === hash) {
        return cached.authoredAtMs;
    }
    const iso = (await runGitText(['log', '-1', '--format=%aI', hash], cwd))?.trim();
    if (!iso) {
        return undefined;
    }
    const authoredAtMs = Date.parse(iso);
    if (Number.isNaN(authoredAtMs)) {
        return undefined;
    }
    headAuthoredAtCache.set(cwd, { hash, authoredAtMs });
    return authoredAtMs;
}

async function runGitText(
    args: string[],
    cwd: string,
    maxBuffer = 512 * 1024
): Promise<string | undefined> {
    try {
        const { stdout } = await execFileAsync('git', args, {
            cwd,
            timeout: GIT_LOG_TIMEOUT_MS,
            maxBuffer
        });
        return stdout;
    } catch {
        return undefined;
    }
}

function absoluteRepoPath(repoRoot: string, repoPath: string): string {
    return path.resolve(repoRoot, repoPath);
}

function wholeDaysSince(iso?: string, now = new Date()): number | undefined {
    if (!iso) {
        return undefined;
    }
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) {
        return undefined;
    }
    return Math.max(0, Math.floor((now.getTime() - at.getTime()) / (24 * 60 * 60 * 1000)));
}

function median(values: number[]): number | undefined {
    if (values.length === 0) {
        return undefined;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

function relativeChangeLabel(
    value?: number
): GitFocusStats['relativeChangeLabel'] {
    if (value === undefined || !Number.isFinite(value)) {
        return undefined;
    }
    if (value >= 3) {
        return 'very_hot';
    }
    if (value >= 1.5) {
        return 'hot';
    }
    if (value < 0.5) {
        return 'cold';
    }
    return 'typical';
}

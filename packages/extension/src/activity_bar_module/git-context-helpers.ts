import type { GitAuthorRollup, GitFocusCommit } from '@reqlan/analytical';

/** Parse `git log` null-delimited records (hash, short, subject, author, authoredAt). */
export function parseGitLogRecords(stdout: string): GitFocusCommit[] {
    const commits: GitFocusCommit[] = [];
    const trimmed = stdout.trim();
    if (!trimmed) {
        return commits;
    }
    for (const record of trimmed.split('\n')) {
        const parts = record.split('\0');
        if (parts.length < 5) {
            continue;
        }
        const [hash, shortHash, subject, author, authoredAt] = parts;
        if (!hash || !shortHash) {
            continue;
        }
        commits.push({
            hash,
            shortHash,
            subject: subject || '(no subject)',
            author: author || 'unknown',
            authoredAt: authoredAt || ''
        });
    }
    return commits;
}

export function rollupAuthors(commits: GitFocusCommit[], limit = 5): GitAuthorRollup[] {
    const counts = new Map<string, number>();
    for (const commit of commits) {
        counts.set(commit.author, (counts.get(commit.author) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([name, commitCount]) => ({ name, commitCount }))
        .sort((a, b) => b.commitCount - a.commitCount || a.name.localeCompare(b.name))
        .slice(0, limit);
}

export function buildGitSummary(input: {
    branch?: string;
    headShort?: string;
    commits: GitFocusCommit[];
    authors: GitAuthorRollup[];
    dirtyCount: number;
}): string {
    const branch = input.branch ?? 'detached';
    if (input.commits.length > 0) {
        const authorLabel =
            input.authors.length === 1 ? '1 author' : `${input.authors.length} authors`;
        return `${branch} · ${input.commits.length} commit${input.commits.length === 1 ? '' : 's'} · ${authorLabel}`;
    }
    if (input.dirtyCount > 0) {
        return `${branch} · ${input.dirtyCount} dirty`;
    }
    if (input.headShort) {
        return `${branch} · ${input.headShort}`;
    }
    return branch === 'detached' ? 'No repo' : `${branch} · no history`;
}

export function buildHistoryCue(input: {
    branch?: string;
    commits: GitFocusCommit[];
    now?: Date;
}): string | undefined {
    const latest = input.commits[0];
    if (!latest?.authoredAt) {
        return input.branch;
    }
    const relative = formatRelativeAge(latest.authoredAt, input.now);
    if (!relative) {
        return input.branch;
    }
    return input.branch ? `${relative} · ${input.branch}` : relative;
}

export function formatRelativeAge(iso: string, now = new Date()): string | undefined {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) {
        return undefined;
    }
    const days = Math.floor((now.getTime() - at.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 0) {
        return 'today';
    }
    if (days === 1) {
        return '1d ago';
    }
    if (days < 30) {
        return `${days}d ago`;
    }
    const months = Math.floor(days / 30);
    if (months < 12) {
        return `${months}mo ago`;
    }
    const years = Math.floor(days / 365);
    return `${years}y ago`;
}

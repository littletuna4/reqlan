/**
 * Fuzzy / partial idea search with interchangeable separators.
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
 */
import type { IdeaSummary } from '../core/types.js';

export interface FuzzySearchHit {
    id: string;
    name: string;
    kind: IdeaSummary['kind'];
    fileUri: string;
    summary: string;
    lineStart: number;
    score: number;
}

/**
 * Characters treated as the same separator family: underscore, hyphen,
 * ellipsis / dots, and whitespace. Runs collapse to nothing for matching so
 * `cli package`, `cli_package`, `cli-package`, and `cli...package` align.
 */
const SEPARATOR_RE = /[_\-\s.…]+/g;

/** Lowercase and strip interchangeable separators for comparison. */
export function normalizeSearchSeparators(value: string): string {
    return value.toLowerCase().replace(SEPARATOR_RE, '');
}

/** Split on interchangeable separators into lowercase word tokens. */
export function splitSearchTokens(value: string): string[] {
    return value
        .toLowerCase()
        .split(SEPARATOR_RE)
        .map(token => token.trim())
        .filter(Boolean);
}

export function filterAndScoreIdeas(ideas: IdeaSummary[], query: string): FuzzySearchHit[] {
    return rankScoredIdeas(scoreIdeas(ideas, query));
}

/**
 * Score ideas in chunks, yielding to the event loop so UI actions (e.g. openIdea)
 * are not blocked by a long synchronous scan of a large index.
 * Returns `undefined` when `isCancelled` becomes true mid-run.
 */
export async function filterAndScoreIdeasAsync(
    ideas: IdeaSummary[],
    query: string,
    options?: {
        isCancelled?: () => boolean;
        /** Ideas processed between yields; default 250. */
        chunkSize?: number;
    }
): Promise<FuzzySearchHit[] | undefined> {
    const chunkSize = Math.max(1, options?.chunkSize ?? 250);
    const isCancelled = options?.isCancelled;
    const rawNeedle = query.trim().toLowerCase();
    const needle = normalizeSearchSeparators(rawNeedle);
    const queryTokens = splitSearchTokens(rawNeedle);
    const scored: FuzzySearchHit[] = [];

    for (let index = 0; index < ideas.length; index += 1) {
        if (index > 0 && index % chunkSize === 0) {
            if (isCancelled?.()) {
                return undefined;
            }
            await yieldEventLoop();
            if (isCancelled?.()) {
                return undefined;
            }
        }
        const idea = ideas[index]!;
        if (idea.kind === 'ideaset') {
            continue;
        }
        const score = rawNeedle ? scoreIdeaMatch(idea, rawNeedle, needle, queryTokens) : 1;
        if (score <= 0) {
            continue;
        }
        scored.push({
            id: idea.id,
            name: idea.name,
            kind: idea.kind,
            fileUri: idea.fileUri,
            summary: idea.summary,
            lineStart: idea.lineStart,
            score
        });
    }

    if (isCancelled?.()) {
        return undefined;
    }
    return rankScoredIdeas(scored);
}

function scoreIdeas(ideas: IdeaSummary[], query: string): FuzzySearchHit[] {
    const rawNeedle = query.trim().toLowerCase();
    const needle = normalizeSearchSeparators(rawNeedle);
    const queryTokens = splitSearchTokens(rawNeedle);
    const scored: FuzzySearchHit[] = [];
    for (const idea of ideas) {
        if (idea.kind === 'ideaset') {
            continue;
        }
        const score = rawNeedle ? scoreIdeaMatch(idea, rawNeedle, needle, queryTokens) : 1;
        if (score <= 0) {
            continue;
        }
        scored.push({
            id: idea.id,
            name: idea.name,
            kind: idea.kind,
            fileUri: idea.fileUri,
            summary: idea.summary,
            lineStart: idea.lineStart,
            score
        });
    }
    return scored;
}

function rankScoredIdeas(scored: FuzzySearchHit[]): FuzzySearchHit[] {
    return scored.sort(
        (left, right) =>
            right.score - left.score
            || left.name.localeCompare(right.name)
            || left.fileUri.localeCompare(right.fileUri)
    );
}

function yieldEventLoop(): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, 0);
    });
}

function scoreIdeaMatch(
    idea: IdeaSummary,
    rawNeedle: string,
    needle: string,
    queryTokens: string[]
): number {
    const nameRaw = idea.name.toLowerCase();
    const name = normalizeSearchSeparators(idea.name);
    const summaryRaw = idea.summary.toLowerCase();
    const summary = normalizeSearchSeparators(idea.summary);
    let score = 0;

    if (nameRaw === rawNeedle || name === needle) {
        score = 100;
    } else if (nameRaw.startsWith(rawNeedle) || name.startsWith(needle)) {
        score = 80;
    } else if (nameRaw.includes(rawNeedle) || name.includes(needle)) {
        score = 50;
    } else if (fuzzySubsequence(nameRaw, rawNeedle) || fuzzySubsequence(name, needle)) {
        score = 30;
    }

    const nameTokenKind = matchQueryTokens(splitSearchTokens(idea.name), queryTokens);
    if (nameTokenKind === 'ordered') {
        score = Math.max(score, 45);
    } else if (nameTokenKind === 'reordered') {
        score = Math.max(score, 35);
    }

    if (summaryRaw.includes(rawNeedle) || (needle && summary.includes(needle))) {
        score = Math.max(score, 20) + 5;
    } else {
        const summaryTokenKind = matchQueryTokens(splitSearchTokens(idea.summary), queryTokens);
        if (summaryTokenKind === 'ordered') {
            score = Math.max(score, 22);
        } else if (summaryTokenKind === 'reordered') {
            score = Math.max(score, 18);
        }
    }
    for (const tag of idea.tags) {
        const tagRaw = tag.toLowerCase();
        const tagNorm = normalizeSearchSeparators(tag);
        if (tagRaw.includes(rawNeedle) || (needle && tagNorm.includes(needle))) {
            score = Math.max(score, 15) + 2;
        } else if (matchQueryTokens(splitSearchTokens(tag), queryTokens) !== null) {
            score = Math.max(score, 15) + 2;
        }
    }
    return score;
}

/**
 * Match every query token against hay tokens.
 * Prefers order-preserving matches; still accepts reordered tokens (missing
 * intermediate hay words are fine either way).
 */
export function matchQueryTokens(
    hayTokens: string[],
    queryTokens: string[]
): 'ordered' | 'reordered' | null {
    if (queryTokens.length === 0 || hayTokens.length === 0) {
        return null;
    }

    let hayIndex = 0;
    let ordered = true;
    for (const queryToken of queryTokens) {
        let found = -1;
        for (let index = hayIndex; index < hayTokens.length; index += 1) {
            if (tokenMatches(hayTokens[index]!, queryToken)) {
                found = index;
                break;
            }
        }
        if (found < 0) {
            ordered = false;
            break;
        }
        hayIndex = found + 1;
    }
    if (ordered) {
        return 'ordered';
    }

    const used = new Set<number>();
    for (const queryToken of queryTokens) {
        let found = -1;
        for (let index = 0; index < hayTokens.length; index += 1) {
            if (used.has(index)) {
                continue;
            }
            if (tokenMatches(hayTokens[index]!, queryToken)) {
                found = index;
                break;
            }
        }
        if (found < 0) {
            return null;
        }
        used.add(found);
    }
    return 'reordered';
}

function tokenMatches(hayToken: string, queryToken: string): boolean {
    return hayToken === queryToken || hayToken.startsWith(queryToken);
}

/** True when needle characters appear in order inside hay (simple fuzzy). */
export function fuzzySubsequence(hay: string, needle: string): boolean {
    if (!needle) {
        return true;
    }
    let index = 0;
    for (const char of hay) {
        if (char === needle[index]) {
            index += 1;
            if (index >= needle.length) {
                return true;
            }
        }
    }
    return false;
}

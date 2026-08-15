/**
 * Fuzzy / partial idea search with interchangeable separators.
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".file_search]
 * rq:["../../../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
 * rq:["../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_match_highlighting]
 */
import type { IdeaSummary } from '../core/types.js';

export interface FuzzySearchHit {
    id: string;
    name: string;
    kind: IdeaSummary['kind'] | 'file';
    fileUri: string;
    summary: string;
    lineStart: number;
    score: number;
}

export interface FuzzySearchPage {
    hits: FuzzySearchHit[];
    total: number;
    truncated: boolean;
}

export interface SearchIndexOptions {
    limit?: number;
    offset?: number;
    requireQuery?: boolean;
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

export function fileBasename(fileUri: string): string {
    const parts = fileUri.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1] ?? fileUri;
}

export function filterAndScoreFiles(fileUris: readonly string[], query: string): FuzzySearchHit[] {
    const rawNeedle = query.trim().toLowerCase();
    if (!rawNeedle) {
        return [];
    }
    const needle = normalizeSearchSeparators(rawNeedle);
    const queryTokens = splitSearchTokens(rawNeedle);
    const scored: FuzzySearchHit[] = [];
    for (const fileUri of fileUris) {
        const name = fileBasename(fileUri);
        const stem = name.replace(/\.rq$/i, '');
        const score = Math.max(
            scoreNameLike(name, rawNeedle, needle, queryTokens),
            scoreNameLike(stem, rawNeedle, needle, queryTokens),
            scoreNameLike(fileUri, rawNeedle, needle, queryTokens)
        );
        if (score <= 0) {
            continue;
        }
        scored.push({
            id: fileUri,
            name,
            kind: 'file',
            fileUri,
            summary: '',
            lineStart: 0,
            score
        });
    }
    return rankScoredIdeas(scored);
}

export function searchIndex(
    ideas: IdeaSummary[],
    fileUris: readonly string[],
    query: string,
    options: SearchIndexOptions = {}
): FuzzySearchPage {
    const trimmed = query.trim();
    if (options.requireQuery && !trimmed) {
        return { hits: [], total: 0, truncated: false };
    }
    const ranked = trimmed
        ? rankScoredIdeas([...filterAndScoreIdeas(ideas, trimmed), ...filterAndScoreFiles(fileUris, trimmed)])
        : filterAndScoreIdeas(ideas, trimmed);
    return paginateHits(ranked, options);
}

export function paginateHits(
    ranked: FuzzySearchHit[],
    options: SearchIndexOptions = {}
): FuzzySearchPage {
    const total = ranked.length;
    const offset = Math.min(Math.max(0, options.offset ?? 0), total);
    const hits = options.limit === undefined
        ? ranked.slice(offset)
        : ranked.slice(offset, offset + Math.max(0, options.limit));
    return {
        hits,
        total,
        truncated: offset + hits.length < total
    };
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
    const summaryRaw = idea.summary.toLowerCase();
    const summary = normalizeSearchSeparators(idea.summary);
    let score = scoreNameLike(idea.name, rawNeedle, needle, queryTokens);

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

function scoreNameLike(
    hay: string,
    rawNeedle: string,
    needle: string,
    queryTokens: string[]
): number {
    const hayRaw = hay.toLowerCase();
    const hayNorm = normalizeSearchSeparators(hay);
    let score = 0;
    if (hayRaw === rawNeedle || hayNorm === needle) {
        score = 100;
    } else if (hayRaw.startsWith(rawNeedle) || hayNorm.startsWith(needle)) {
        score = 80;
    } else if (hayRaw.includes(rawNeedle) || hayNorm.includes(needle)) {
        score = 50;
    } else if (fuzzySubsequence(hayRaw, rawNeedle) || fuzzySubsequence(hayNorm, needle)) {
        score = 30;
    }
    const tokenKind = matchQueryTokens(splitSearchTokens(hay), queryTokens);
    if (tokenKind === 'ordered') {
        score = Math.max(score, 45);
    } else if (tokenKind === 'reordered') {
        score = Math.max(score, 35);
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

export interface SearchHighlightRange {
    start: number;
    end: number;
}

export interface SearchHighlightPart {
    text: string;
    matched: boolean;
}

export interface SearchHighlightOptions {
    /**
     * When denser strategies miss, highlight in-order character subsequence.
     * Use for short fields (idea names). Skip on long summaries/paths so
     * scattered letters do not light up the whole line.
     */
    allowSparseFuzzy?: boolean;
}

/**
 * Ranges in `hay` that correspond to the fuzzy query.
 * Prefers contiguous / token / word-start matches over sparse subsequence.
 */
export function findSearchHighlightRanges(
    hay: string,
    query: string,
    options?: SearchHighlightOptions
): SearchHighlightRange[] {
    const rawNeedle = query.trim();
    if (!rawNeedle || !hay) {
        return [];
    }

    const substring = findAllCaseInsensitiveSubstrings(hay, rawNeedle);
    if (substring.length > 0) {
        return substring;
    }

    const normalized = findNormalizedSubstringRanges(hay, rawNeedle);
    if (normalized.length > 0) {
        return normalized;
    }

    const tokens = findTokenPrefixRanges(hay, rawNeedle);
    if (tokens.length > 0) {
        return tokens;
    }

    const acronym = findWordStartRanges(hay, rawNeedle);
    if (acronym.length > 0) {
        return acronym;
    }

    if (options?.allowSparseFuzzy) {
        return findFuzzySubsequenceRanges(hay, rawNeedle);
    }
    return [];
}

/** Split `hay` into matched / unmatched slices for rendering. */
export function splitSearchHighlight(
    hay: string,
    query: string,
    options?: SearchHighlightOptions
): SearchHighlightPart[] {
    const ranges = findSearchHighlightRanges(hay, query, options);
    if (ranges.length === 0) {
        return hay ? [{ text: hay, matched: false }] : [];
    }
    const parts: SearchHighlightPart[] = [];
    let cursor = 0;
    for (const range of ranges) {
        if (range.start > cursor) {
            parts.push({ text: hay.slice(cursor, range.start), matched: false });
        }
        if (range.end > range.start) {
            parts.push({ text: hay.slice(range.start, range.end), matched: true });
        }
        cursor = Math.max(cursor, range.end);
    }
    if (cursor < hay.length) {
        parts.push({ text: hay.slice(cursor), matched: false });
    }
    return parts;
}

function isSearchSeparator(char: string): boolean {
    return /[_\-\s.…]/.test(char);
}

function findAllCaseInsensitiveSubstrings(hay: string, rawNeedle: string): SearchHighlightRange[] {
    const needle = rawNeedle.toLowerCase();
    const hayLower = hay.toLowerCase();
    if (!needle) {
        return [];
    }
    const ranges: SearchHighlightRange[] = [];
    let from = 0;
    while (from <= hayLower.length - needle.length) {
        const index = hayLower.indexOf(needle, from);
        if (index < 0) {
            break;
        }
        ranges.push({ start: index, end: index + needle.length });
        from = index + needle.length;
    }
    return ranges;
}

function findNormalizedSubstringRanges(hay: string, rawNeedle: string): SearchHighlightRange[] {
    const needle = normalizeSearchSeparators(rawNeedle);
    if (!needle) {
        return [];
    }
    const origIndex: number[] = [];
    let normalized = '';
    for (let index = 0; index < hay.length; index += 1) {
        const char = hay[index]!;
        if (isSearchSeparator(char)) {
            continue;
        }
        normalized += char.toLowerCase();
        origIndex.push(index);
    }
    const ranges: SearchHighlightRange[] = [];
    let from = 0;
    while (from <= normalized.length - needle.length) {
        const index = normalized.indexOf(needle, from);
        if (index < 0) {
            break;
        }
        const startOrig = origIndex[index]!;
        const endOrig = origIndex[index + needle.length - 1]! + 1;
        ranges.push({ start: startOrig, end: endOrig });
        from = index + needle.length;
    }
    return ranges;
}

function tokensWithRanges(value: string): { token: string; start: number; end: number }[] {
    const tokens: { token: string; start: number; end: number }[] = [];
    let start = -1;
    for (let index = 0; index <= value.length; index += 1) {
        const atEnd = index === value.length;
        const sep = atEnd || isSearchSeparator(value[index]!);
        if (!sep && start < 0) {
            start = index;
        } else if (sep && start >= 0) {
            tokens.push({
                token: value.slice(start, index).toLowerCase(),
                start,
                end: index
            });
            start = -1;
        }
    }
    return tokens;
}

function findTokenPrefixRanges(hay: string, rawNeedle: string): SearchHighlightRange[] {
    const queryTokens = splitSearchTokens(rawNeedle);
    const hayTokens = tokensWithRanges(hay);
    if (queryTokens.length === 0 || hayTokens.length === 0) {
        return [];
    }

    const ranges: SearchHighlightRange[] = [];
    let hayIndex = 0;
    let ordered = true;
    for (const queryToken of queryTokens) {
        let found = -1;
        for (let index = hayIndex; index < hayTokens.length; index += 1) {
            if (tokenMatches(hayTokens[index]!.token, queryToken)) {
                found = index;
                break;
            }
        }
        if (found < 0) {
            ordered = false;
            break;
        }
        pushTokenPrefixRange(ranges, hayTokens[found]!, queryToken);
        hayIndex = found + 1;
    }
    if (ordered) {
        return mergeHighlightRanges(ranges);
    }

    const used = new Set<number>();
    const reordered: SearchHighlightRange[] = [];
    for (const queryToken of queryTokens) {
        let found = -1;
        for (let index = 0; index < hayTokens.length; index += 1) {
            if (used.has(index)) {
                continue;
            }
            if (tokenMatches(hayTokens[index]!.token, queryToken)) {
                found = index;
                break;
            }
        }
        if (found < 0) {
            return [];
        }
        used.add(found);
        pushTokenPrefixRange(reordered, hayTokens[found]!, queryToken);
    }
    return mergeHighlightRanges(reordered);
}

function pushTokenPrefixRange(
    ranges: SearchHighlightRange[],
    hayToken: { start: number; end: number },
    queryToken: string
): void {
    ranges.push({
        start: hayToken.start,
        end: Math.min(hayToken.start + queryToken.length, hayToken.end)
    });
}

function findWordStartRanges(hay: string, rawNeedle: string): SearchHighlightRange[] {
    const needleChars = normalizeSearchSeparators(rawNeedle);
    const hayTokens = tokensWithRanges(hay);
    if (!needleChars || hayTokens.length === 0) {
        return [];
    }
    const ranges: SearchHighlightRange[] = [];
    let needleIndex = 0;
    for (const token of hayTokens) {
        if (needleIndex >= needleChars.length) {
            break;
        }
        if (token.token[0] === needleChars[needleIndex]) {
            ranges.push({ start: token.start, end: token.start + 1 });
            needleIndex += 1;
        }
    }
    return needleIndex === needleChars.length ? ranges : [];
}

function findFuzzySubsequenceRanges(hay: string, rawNeedle: string): SearchHighlightRange[] {
    const rawPositions = matchSubsequencePositions(hay.toLowerCase(), rawNeedle.toLowerCase());
    if (rawPositions) {
        return mergeHighlightRanges(rawPositions.map(index => ({ start: index, end: index + 1 })));
    }
    const needleNorm = normalizeSearchSeparators(rawNeedle);
    if (!needleNorm) {
        return [];
    }
    const origIndex: number[] = [];
    let normalized = '';
    for (let index = 0; index < hay.length; index += 1) {
        const char = hay[index]!;
        if (isSearchSeparator(char)) {
            continue;
        }
        normalized += char.toLowerCase();
        origIndex.push(index);
    }
    const normPositions = matchSubsequencePositions(normalized, needleNorm);
    if (!normPositions) {
        return [];
    }
    return mergeHighlightRanges(
        normPositions.map(index => ({ start: origIndex[index]!, end: origIndex[index]! + 1 }))
    );
}

function matchSubsequencePositions(hay: string, needle: string): number[] | null {
    if (!needle) {
        return [];
    }
    const positions: number[] = [];
    let from = 0;
    for (const char of needle) {
        const index = hay.indexOf(char, from);
        if (index < 0) {
            return null;
        }
        positions.push(index);
        from = index + 1;
    }
    return positions;
}

function mergeHighlightRanges(ranges: SearchHighlightRange[]): SearchHighlightRange[] {
    if (ranges.length === 0) {
        return [];
    }
    const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
    const merged: SearchHighlightRange[] = [{ start: sorted[0]!.start, end: sorted[0]!.end }];
    for (let index = 1; index < sorted.length; index += 1) {
        const current = sorted[index]!;
        const last = merged[merged.length - 1]!;
        if (current.start <= last.end) {
            last.end = Math.max(last.end, current.end);
        } else {
            merged.push({ start: current.start, end: current.end });
        }
    }
    return merged;
}

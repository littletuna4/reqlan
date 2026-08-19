/**
 * Pure batching / scheduling helpers for silent git_dates background fill.
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_dates_rate_cap]
 * rq:["../../../../reqlan rq/core_analysis/core.rq".consumption_silence]
 */

/** Ideas per analyser invocation. */
export const GIT_DATES_BG_BATCH_SIZE = 3;
/** Pause between batches so the extension host stays responsive. */
export const GIT_DATES_BG_YIELD_MS = 400;
/** Delay after editor switch / continue-wave before starting work. */
export const GIT_DATES_BG_START_IDLE_MS = 1_500;
/** Quiet period after index catalog/status churn (saves) before a catalog-triggered wave. */
export const GIT_DATES_BG_CATALOG_DEBOUNCE_MS = 10_000;
/** Minimum gap between catalog-triggered waves that actually ran git. */
export const GIT_DATES_BG_MIN_WAVE_GAP_MS = 45_000;
/** Cap how many ideas we attempt in one continuous pump wave. */
export const GIT_DATES_BG_MAX_PER_WAVE = 60;

export type GitDatesScheduleReason = 'catalog' | 'editor' | 'continue';

export interface GitDatesScheduleDelayInput {
    reason: GitDatesScheduleReason;
    nowMs: number;
    /** Set only after a wave that processed at least one idea. */
    lastFilledWaveAtMs?: number;
    catalogDebounceMs?: number;
    editorDebounceMs?: number;
    minWaveGapMs?: number;
}

/**
 * Delay before a git_dates wave. Catalog/save events coalesce and respect a min gap.
 * Editor switches and in-flight continue waves stay on the short idle delay.
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_dates_rate_cap]
 */
export function gitDatesScheduleDelayMs(input: GitDatesScheduleDelayInput): number {
    const editorDebounce = input.editorDebounceMs ?? GIT_DATES_BG_START_IDLE_MS;
    if (input.reason === 'editor' || input.reason === 'continue') {
        return editorDebounce;
    }
    const catalogDebounce = input.catalogDebounceMs ?? GIT_DATES_BG_CATALOG_DEBOUNCE_MS;
    const minGap = input.minWaveGapMs ?? GIT_DATES_BG_MIN_WAVE_GAP_MS;
    const sinceFill =
        input.lastFilledWaveAtMs === undefined
            ? Number.POSITIVE_INFINITY
            : input.nowMs - input.lastFilledWaveAtMs;
    const gapRemain = Math.max(0, minGap - sinceFill);
    return Math.max(catalogDebounce, gapRemain);
}

export interface GitDatesBackgroundWaveInput {
    isReady: () => boolean;
    /** Global missing-id queue (already may be prefer-ordered by the store). */
    listMissing: (limit: number) => Promise<string[]>;
    /**
     * Optional high-priority missing ids (e.g. ideas in the active editor file).
     * These are attempted before `listMissing` within each batch.
     */
    listPriorityMissing?: (limit: number) => Promise<string[]>;
    /** When true between batches, end the wave early so a reschedule can pick a new priority file. */
    shouldStop?: () => boolean;
    attempted: Set<string>;
    runAnalyser: (ideaIds: string[]) => Promise<void>;
    delay?: (ms: number) => Promise<void>;
    batchSize?: number;
    maxPerWave?: number;
    yieldMs?: number;
}

export interface GitDatesBackgroundWaveResult {
    processed: number;
    batches: number;
}

/**
 * Take up to `limit` ids, preferring those listed first in `priority` then `rest`.
 * Used so current-file ideas stay ahead of the global backlog.
 */
export function takePreferredIdeaIds(
    priority: readonly string[],
    rest: readonly string[],
    limit: number,
    exclude?: ReadonlySet<string>
): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of [...priority, ...rest]) {
        if (exclude?.has(id) || seen.has(id)) {
            continue;
        }
        seen.add(id);
        out.push(id);
        if (out.length >= limit) {
            break;
        }
    }
    return out;
}

/**
 * Process missing git dates in small yielded batches until the wave cap or queue empties.
 * Does not start when `isReady()` is false. Marks ids attempted before running so
 * failures are not retried within the same session.
 * `listPriorityMissing` (e.g. active editor file) is drained before the general queue.
 */
export async function runGitDatesBackgroundWave(
    input: GitDatesBackgroundWaveInput
): Promise<GitDatesBackgroundWaveResult> {
    if (!input.isReady()) {
        return { processed: 0, batches: 0 };
    }

    const batchSize = input.batchSize ?? GIT_DATES_BG_BATCH_SIZE;
    const maxPerWave = input.maxPerWave ?? GIT_DATES_BG_MAX_PER_WAVE;
    const yieldMs = input.yieldMs ?? GIT_DATES_BG_YIELD_MS;
    const delay = input.delay ?? defaultDelay;
    const shouldStop = input.shouldStop ?? (() => false);

    let processed = 0;
    let batches = 0;

    while (processed < maxPerWave) {
        if (!input.isReady() || shouldStop()) {
            break;
        }

        const remaining = maxPerWave - processed;
        const want = Math.min(batchSize, remaining);
        const fetchLimit = Math.min(200, Math.max(want * 8, want + input.attempted.size));
        const priority = input.listPriorityMissing
            ? await input.listPriorityMissing(fetchLimit)
            : [];
        const rest = await input.listMissing(fetchLimit);
        const missing = takePreferredIdeaIds(priority, rest, want, input.attempted);
        if (missing.length === 0) {
            break;
        }

        for (const id of missing) {
            input.attempted.add(id);
        }

        try {
            await input.runAnalyser(missing);
        } catch {
            // Stay silent — dates remain empty until a later session retry.
        }

        batches += 1;
        processed += missing.length;
        if (processed < maxPerWave && !shouldStop()) {
            const morePriority = input.listPriorityMissing
                ? takePreferredIdeaIds(
                    await input.listPriorityMissing(fetchLimit),
                    [],
                    1,
                    input.attempted
                )
                : [];
            const moreRest = takePreferredIdeaIds(
                [],
                await input.listMissing(fetchLimit),
                1,
                input.attempted
            );
            if (morePriority.length === 0 && moreRest.length === 0) {
                break;
            }
            await delay(yieldMs);
        }
    }

    return { processed, batches };
}

function defaultDelay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

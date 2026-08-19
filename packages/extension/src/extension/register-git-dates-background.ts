/**
 * Silent background git_dates fill after the ideas index is ready.
 * Not an on-the-fly editor action — small batches with yields so indexing stays quiet.
 * Queue prefers ideas in the active .rq editor when one is focused.
 * Catalog/save events are debounced and rate-capped so git log does not run on every save.
 *
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_dates_rate_cap]
 * rq:["../../../../reqlan rq/core_analysis/core.rq".consumption_silence]
 */
import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import {
    GIT_DATES_BG_MAX_PER_WAVE,
    gitDatesScheduleDelayMs,
    runGitDatesBackgroundWave,
    type GitDatesScheduleReason
} from './git-dates-background.js';

const attemptedIdeaIds = new Set<string>();

let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
let pumpRunning = false;
/** Bumped when the active editor changes so an in-flight wave can stop and reschedule. */
let priorityEpoch = 0;
let pendingReschedule = false;
let lastFilledWaveAtMs: number | undefined;

export function registerGitDatesBackgroundIndexing(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const schedule = (reason: GitDatesScheduleReason): void => {
        if (scheduleTimer) {
            clearTimeout(scheduleTimer);
        }
        const delay = gitDatesScheduleDelayMs({
            reason,
            nowMs: Date.now(),
            lastFilledWaveAtMs
        });
        console.log(`[reqlan] git_dates: ${reason} scheduled in ${delay}ms`);
        scheduleTimer = setTimeout(() => {
            scheduleTimer = undefined;
            void pumpMissingGitDates(submodule);
        }, delay);
    };

    const unsubStatus = submodule.index.subscribeStatusUpdates(() => {
        if (submodule.index.isReady) {
            schedule('catalog');
        }
    });
    const unsubCatalog = submodule.index.subscribeCatalogUpdates(() => {
        if (submodule.index.isReady) {
            schedule('catalog');
        }
    });

    context.subscriptions.push(
        { dispose: unsubStatus },
        { dispose: unsubCatalog },
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!submodule.index.isReady || !isRqDocument(editor?.document)) {
                return;
            }
            priorityEpoch += 1;
            if (pumpRunning) {
                pendingReschedule = true;
            }
            schedule('editor');
        }),
        {
            dispose: () => {
                if (scheduleTimer) {
                    clearTimeout(scheduleTimer);
                }
            }
        }
    );

    if (submodule.index.isReady) {
        schedule('catalog');
    }
}

async function pumpMissingGitDates(submodule: AnalyticalSubmodule): Promise<void> {
    if (pumpRunning || !submodule.index.isReady) {
        return;
    }
    pumpRunning = true;
    const waveEpoch = priorityEpoch;
    try {
        const result = await runGitDatesBackgroundWave({
            isReady: () => submodule.index.isReady,
            listPriorityMissing: async limit => {
                const fileUri = activeRqIndexFileUri(submodule);
                if (!fileUri) {
                    return [];
                }
                return submodule.index.indexStore.listIdeaIdsMissingGitDates(limit, { fileUri });
            },
            listMissing: limit => submodule.index.indexStore.listIdeaIdsMissingGitDates(limit),
            shouldStop: () => priorityEpoch !== waveEpoch,
            attempted: attemptedIdeaIds,
            runAnalyser: async ideaIds => {
                // Git log + persist runs natively; the extension only schedules waves.
                const updated = submodule.index.fillGitDates(ideaIds);
                console.log(
                    `[reqlan] git_dates: filled ${updated} of ${ideaIds.length} idea(s)`
                );
            }
        });
        if (result.processed > 0) {
            lastFilledWaveAtMs = Date.now();
        }
        console.log(
            `[reqlan] git_dates: wave processed ${result.processed} idea(s) in ${result.batches} batch(es)`
        );
        if (pendingReschedule || priorityEpoch !== waveEpoch) {
            pendingReschedule = false;
            scheduleAfterPump(submodule, 'editor');
        } else if (result.processed >= GIT_DATES_BG_MAX_PER_WAVE) {
            scheduleAfterPump(submodule, 'continue');
        }
    } finally {
        pumpRunning = false;
    }
}

function scheduleAfterPump(submodule: AnalyticalSubmodule, reason: GitDatesScheduleReason): void {
    if (!submodule.index.isReady) {
        return;
    }
    if (scheduleTimer) {
        clearTimeout(scheduleTimer);
    }
    const delay = gitDatesScheduleDelayMs({
        reason,
        nowMs: Date.now(),
        lastFilledWaveAtMs
    });
    console.log(`[reqlan] git_dates: ${reason} scheduled in ${delay}ms`);
    scheduleTimer = setTimeout(() => {
        scheduleTimer = undefined;
        void pumpMissingGitDates(submodule);
    }, delay);
}

function isRqDocument(document: vscode.TextDocument | undefined): boolean {
    if (!document) {
        return false;
    }
    return document.languageId === 'reqlan' || document.fileName.toLowerCase().endsWith('.rq');
}

function activeRqIndexFileUri(submodule: AnalyticalSubmodule): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!isRqDocument(editor?.document)) {
        return undefined;
    }
    const baseRoot = submodule.index.getActiveBase()?.descriptor.root;
    return toIndexFileUri(editor!.document.uri, baseRoot);
}

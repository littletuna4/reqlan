/**
 * Silent background git_dates fill after the ideas index is ready.
 * Not an on-the-fly editor action — small batches with yields so indexing stays quiet.
 * Queue prefers ideas in the active .rq editor when one is focused.
 *
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
 * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
 */
import type { GitDateInfo } from '@reqlan/analytical';
import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import {
    GIT_DATES_BG_START_IDLE_MS,
    runGitDatesBackgroundWave
} from './git-dates-background.js';

const attemptedIdeaIds = new Set<string>();

let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
let pumpRunning = false;
/** Bumped when the active editor changes so an in-flight wave can stop and reschedule. */
let priorityEpoch = 0;
let pendingReschedule = false;

export function registerGitDatesBackgroundIndexing(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const schedule = (): void => {
        if (scheduleTimer) {
            clearTimeout(scheduleTimer);
        }
        scheduleTimer = setTimeout(() => {
            scheduleTimer = undefined;
            void pumpMissingGitDates(submodule);
        }, GIT_DATES_BG_START_IDLE_MS);
    };

    const unsubStatus = submodule.index.subscribeStatusUpdates(() => {
        if (submodule.index.isReady) {
            schedule();
        }
    });
    const unsubCatalog = submodule.index.subscribeCatalogUpdates(() => {
        if (submodule.index.isReady) {
            schedule();
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
            schedule();
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
        schedule();
    }
}

async function pumpMissingGitDates(submodule: AnalyticalSubmodule): Promise<void> {
    if (pumpRunning || !submodule.index.isReady) {
        return;
    }
    pumpRunning = true;
    const waveEpoch = priorityEpoch;
    try {
        await runGitDatesBackgroundWave({
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
                const store = submodule.index.indexStore;
                const workspaceRoot =
                    submodule.index.getActiveBase()?.descriptor.root ??
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                await submodule.analysers.run<{ ideaIds?: string[] }, GitDateInfo[]>(
                    {
                        store,
                        analytical: submodule.index.store,
                        workspaceRoot
                    },
                    'git_dates',
                    { ideaIds }
                );
            }
        });
    } finally {
        pumpRunning = false;
        if (pendingReschedule || priorityEpoch !== waveEpoch) {
            pendingReschedule = false;
            scheduleAfterPump(submodule);
        }
    }
}

function scheduleAfterPump(submodule: AnalyticalSubmodule): void {
    if (!submodule.index.isReady) {
        return;
    }
    if (scheduleTimer) {
        clearTimeout(scheduleTimer);
    }
    scheduleTimer = setTimeout(() => {
        scheduleTimer = undefined;
        void pumpMissingGitDates(submodule);
    }, GIT_DATES_BG_START_IDLE_MS);
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

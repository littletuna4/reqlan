/**
 * Push SQLite inbound edges for visible editors to the language server.
 * Event-driven: only real ready-state batches; never wipe last-good mid-sync.
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
 * rq:["../../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 * rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".lazy_features_after_outbound]
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
 */
import {
    REQLAN_INBOUND_SNAPSHOT_NOTIFICATION,
    type InboundFileSnapshot,
    type InboundSnapshotBatch
} from '@reqlan/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { buildInboundFileSnapshot } from './inbound-snapshot-push.js';
import {
    createCoalescedRunner,
    shouldPushInboundSnapshots
} from './inbound-snapshot-schedule.js';
import type { FileInboundCodeLensProvider } from './register-file-inbound-code-lens.js';

function inboundIdeaCount(snapshot: InboundFileSnapshot): number {
    return Object.values(snapshot.byIdeaName).reduce((sum, rows) => sum + rows.length, 0);
}

export function registerInboundSqliteSync(
    context: vscode.ExtensionContext,
    index: IndexService,
    getClient: () => LanguageClient | undefined,
    fileInboundCodeLens?: FileInboundCodeLensProvider
): void {
    /** True when a push was requested while the index was not ready. */
    let deferredPush = false;

    const pushSnapshots = async (): Promise<void> => {
        if (!shouldPushInboundSnapshots(index.isReady)) {
            // Keep LSP last-good; remember so the ready-edge flushes.
            if (!deferredPush) {
                console.log(
                    `[reqlan] inbound: defer push (index state=${index.state}, ready=false)`
                );
            }
            deferredPush = true;
            return;
        }
        deferredPush = false;
        const client = getClient();
        const editors = vscode.window.visibleTextEditors;
        const snapshots: InboundFileSnapshot[] = [];
        try {
            for (const editor of editors) {
                try {
                    snapshots.push(await buildInboundFileSnapshot(index, editor.document.uri));
                } catch (error) {
                    console.error(
                        `[reqlan] inbound: build failed for ${editor.document.uri.toString()}:`,
                        error
                    );
                }
            }
            if (snapshots.length === 0) {
                console.log(
                    `[reqlan] inbound: skip push (ready, visibleEditors=${editors.length}, no snapshots)`
                );
                return;
            }
            const summary = snapshots
                .map(snapshot => {
                    const ideas = Object.keys(snapshot.byIdeaName).length;
                    const refs = inboundIdeaCount(snapshot);
                    const files = snapshot.fileReferencers?.length ?? 0;
                    return `${snapshot.indexedUri}:{ideas=${ideas},inbound=${refs},fileRefs=${files}}`;
                })
                .join('; ');
            fileInboundCodeLens?.updateSnapshots(snapshots);
            if (!client) {
                console.log(`[reqlan] inbound: built ${snapshots.length} snapshot(s) but no LSP client yet — ${summary}`);
                return;
            }
            client.sendNotification(
                REQLAN_INBOUND_SNAPSHOT_NOTIFICATION,
                { snapshots } satisfies InboundSnapshotBatch
            );
            await client.sendRequest('workspace/inlayHint/refresh').catch(() => undefined);
            await client.sendRequest('workspace/codeLens/refresh').catch(() => undefined);
            console.log(`[reqlan] inbound: pushed ${snapshots.length} snapshot(s) to LSP — ${summary}`);
        } catch (error) {
            console.error('[reqlan] inbound: push failed:', error);
        }
    };

    const schedulePush = createCoalescedRunner(pushSnapshots);
    let wasReady = index.isReady;

    const flushWhenReady = (reason: string): void => {
        if (!index.isReady) {
            if (!deferredPush) {
                console.log(`[reqlan] inbound: defer (${reason}; state=${index.state})`);
            }
            deferredPush = true;
            return;
        }
        console.log(`[reqlan] inbound: schedule push (${reason})`);
        schedulePush();
    };

    const unsubscribeCatalog = index.subscribeCatalogUpdates(() => {
        flushWhenReady('catalog');
    });
    const unsubscribeStatus = index.subscribeStatusUpdates(() => {
        const ready = index.isReady;
        // Ready-edge or a push deferred while Syncing / closed.
        if (ready && (!wasReady || deferredPush)) {
            const reason = !wasReady ? 'ready-edge' : 'deferred-flush';
            console.log(`[reqlan] inbound: status ${reason} (state=${index.state})`);
            schedulePush();
        } else if (!ready && wasReady) {
            console.log(`[reqlan] inbound: index left ready (state=${index.state})`);
        }
        wasReady = ready;
    });
    context.subscriptions.push({ dispose: unsubscribeCatalog });
    context.subscriptions.push({ dispose: unsubscribeStatus });
    context.subscriptions.push(
        vscode.window.onDidChangeVisibleTextEditors(() => {
            void (async () => {
                if (!index.isReady) {
                    // Idle release / late index: reopen so the first visible .rq gets a batch.
                    console.log('[reqlan] inbound: visible editors changed; ensureOpenForUse');
                    await index.ensureOpenForUse().catch(error => {
                        console.error('[reqlan] inbound: ensureOpenForUse failed:', error);
                    });
                }
                flushWhenReady('visible-editors');
            })();
        })
    );
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState(state => {
            if (!state.focused) {
                return;
            }
            void (async () => {
                if (!index.isReady) {
                    console.log('[reqlan] inbound: window focused; ensureOpenForUse');
                    await index.ensureOpenForUse().catch(error => {
                        console.error('[reqlan] inbound: ensureOpenForUse failed:', error);
                    });
                }
                flushWhenReady('window-focus');
            })();
        })
    );

    // Client often starts before the index. Defer until ready, then push.
    console.log(
        `[reqlan] inbound: register sync (index ready=${index.isReady}, state=${index.state})`
    );
    void (async () => {
        if (!index.isReady) {
            deferredPush = true;
            console.log('[reqlan] inbound: initial ensureOpenForUse');
            await index.ensureOpenForUse().catch(error => {
                console.error('[reqlan] inbound: initial ensureOpenForUse failed:', error);
            });
        }
        flushWhenReady('initial');
    })();
}

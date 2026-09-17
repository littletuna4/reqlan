/**
 * Index-host adapter: VS Code wiring over `@reqlan/analytical` (watchers, Uri, IndexService).
 * Product-surface registration lives in `extension/register-contributions.ts`.
 * rq:["../../../../reqlan rq/extension/index-host/index.rq".application_memory]
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import {
    addNativeEngineSearchDirs,
    hostNativeBindingSpec,
    loadNativeEngine,
    resetNativeEngineCache
} from '@reqlan/analytical';
import { IndexService } from './index-store/index-service.js';

export interface AnalyticalSubmodule {
    index: IndexService;
}

/**
 * Load the native engine and construct the index adapter.
 * Does **not** register UI modules or start indexing — the composition root does that.
 */
export function activateAnalyticalSubmodule(
    context: vscode.ExtensionContext
): AnalyticalSubmodule {
    // Host-matching core engine `.node` is staged under native/ by the extension build
    // (F5) and by per-target VSIX packaging.
    // rq:["../../../../reqlan rq/distribution/distribution.rq".extension_host_target]
    // rq:["../../../../reqlan rq/distribution/distribution.rq".vsix_export]
    // rq:["../../../../reqlan rq/development/build.rq".incremental_extension_build]
    addNativeEngineSearchDirs(path.join(context.extensionPath, 'native'));
    const host = hostNativeBindingSpec();
    if (host) {
        addNativeEngineSearchDirs(
            path.join(context.extensionPath, '../../crates/target', host.rustTarget, 'release'),
            path.join(context.extensionPath, '../../crates/target/release'),
            path.join(context.extensionPath, '../../crates/target', host.rustTarget, 'debug'),
            path.join(context.extensionPath, '../../crates/target/debug')
        );
    } else {
        addNativeEngineSearchDirs(
            path.join(context.extensionPath, '../../crates/target/release'),
            path.join(context.extensionPath, '../../crates/target/debug')
        );
    }
    resetNativeEngineCache();
    try {
        loadNativeEngine();
        const hostLabel = host?.vsCodeTarget ?? `${process.platform}-${process.arch}`;
        console.log(`[reqlan] Native analytical engine loaded for extension host ${hostLabel}`);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Native analytical engine is required but was not found';
        console.error(`[reqlan] ${message}`);
        const toast =
            message.length > 400 ? `${message.slice(0, 397).trimEnd()}…` : message;
        void vscode.window.showErrorMessage(`reqlan: ${toast}`);
        throw error;
    }

    const index = new IndexService();
    context.subscriptions.push({
        dispose: () => {
            index.deactivate();
        }
    });

    return { index };
}

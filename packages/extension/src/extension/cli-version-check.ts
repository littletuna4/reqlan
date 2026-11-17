/**
 * VS Code glue for the CLI upgrade warning. Pure logic and spawns live in
 * `cli-version-helpers.ts`.
 * rq:["../../../../reqlan rq/extension/host/cli-version-check.rq".cli_version_check]
 * rq:["../../../../reqlan rq/extension/host/cli-version-check.rq".warning_suppression]
 */
import * as vscode from 'vscode';
import {
    CLI_PACKAGE_NAME,
    UPGRADE_BUTTON,
    compareSemver,
    readInstalledCliVersion,
    readLatestCliVersion
} from './cli-version-helpers.js';
import { EXTENSION_MODE_DEVELOPMENT } from './onboarding-state.js';

/** VS Code `ExtensionContext.globalState` key for the CLI version check. */
const CLI_VERSION_STORAGE_KEY = 'cliVersionCheck';

type CliVersionCheckState = {
    /** Latest version whose warning was already shown; empty when none. */
    warnedLatest: string;
};

function readWarnedLatest(context: vscode.ExtensionContext): string {
    const stored = context.globalState.get<Partial<CliVersionCheckState>>(CLI_VERSION_STORAGE_KEY);
    return stored?.warnedLatest ?? '';
}

function writeWarnedLatest(context: vscode.ExtensionContext, latest: string): Thenable<void> {
    return context.globalState.update(
        CLI_VERSION_STORAGE_KEY,
        { warnedLatest: latest } satisfies CliVersionCheckState
    );
}

/** Upgrade runs in a visible terminal so npm output and errors stay user-visible. */
function openUpgradeTerminal(): void {
    const terminal = vscode.window.createTerminal({ name: 'reqlan CLI upgrade' });
    terminal.show();
    terminal.sendText(`npm install -g ${CLI_PACKAGE_NAME}@latest`);
}

/**
 * One upgrade warning once all start tasks have completed. Silent when no CLI
 * binary is on PATH, when the registry is unreachable, or when the installed
 * version is current or already warned about.
 */
export async function checkAndWarnCliVersion(context: vscode.ExtensionContext): Promise<void> {
    // Dev hosts share the main profile, so the check is skipped to keep the
    // suppression state out of the user's normal installs.
    if (context.extensionMode === EXTENSION_MODE_DEVELOPMENT) {
        return;
    }
    const installed = await readInstalledCliVersion();
    const latest = await readLatestCliVersion();
    if (installed === null || latest === null) {
        return;
    }
    const warnedLatest = readWarnedLatest(context);
    if (compareSemver(installed, latest) >= 0 || warnedLatest === latest) {
        return;
    }
    const picked = await vscode.window.showWarningMessage(
        `reqlan CLI ${installed} is not up to date. The latest version is ${latest}.`,
        UPGRADE_BUTTON
    );
    if (picked === UPGRADE_BUTTON) {
        openUpgradeTerminal();
    }
    await writeWarnedLatest(context, latest);
}

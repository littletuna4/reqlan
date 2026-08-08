import type { IndexStatusView } from '../../../src/webview_module/shared/messages.js';

export interface IndexStatusText {
    text: string;
    error: boolean;
}

export function indexStatusText(status: IndexStatusView): IndexStatusText {
    const issueCount = status.fileIssueCount ?? 0;
    const isGlobalError = Boolean(status.lastError && !status.lastError.file);
    const healthyCounts = `${status.ideaCount} ideas, ${status.edgeCount} references indexed`;

    if (status.ready) {
        if (isGlobalError && status.lastError) {
            return {
                text: `${status.lastError.summary} · ${healthyCounts}`,
                error: true
            };
        }
        if (issueCount > 0) {
            return {
                text: `${issueCount} issue(s) from last index · ${healthyCounts}`,
                error: true
            };
        }
        return { text: healthyCounts, error: false };
    }

    if (isGlobalError && status.lastError) {
        return { text: status.lastError.summary, error: true };
    }

    if (status.lastError?.summary) {
        return { text: status.lastError.summary, error: true };
    }

    if (issueCount > 0) {
        return { text: `${issueCount} issue(s) from last index`, error: true };
    }

    if (status.syncProgress) {
        const file = status.syncProgress.currentFile ? ` · ${status.syncProgress.currentFile}` : '';
        return {
            text: `Indexing workspace… ${status.syncProgress.processed}/${status.syncProgress.total} files${file}`,
            error: false
        };
    }

    return { text: `Index state: ${status.state}`, error: false };
}

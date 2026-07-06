import type { IndexStatusView } from '../../../src/webview_module/shared/messages.js';

export interface IndexStatusText {
    text: string;
    error: boolean;
}

export function indexStatusText(status: IndexStatusView): IndexStatusText {
    const issueCount = status.fileIssueCount ?? 0;
    const isGlobalError = Boolean(status.lastError && !status.lastError.file);

    if (status.ready) {
        const issueHint = issueCount > 0 ? `, ${issueCount} issue(s) from last index` : '';
        return {
            text: `${status.ideaCount} ideas, ${status.edgeCount} references indexed${issueHint}`,
            error: issueCount > 0
        };
    }

    if (isGlobalError && status.lastError) {
        return { text: status.lastError.summary, error: true };
    }

    if (issueCount > 0) {
        return { text: `${issueCount} issue(s) from last index`, error: true };
    }

    if (status.syncProgress) {
        return {
            text: `Indexing workspace… ${status.syncProgress.processed}/${status.syncProgress.total} files`,
            error: false
        };
    }

    return { text: `Index state: ${status.state}`, error: false };
}

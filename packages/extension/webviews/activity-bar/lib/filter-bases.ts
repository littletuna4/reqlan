import type { BaseStatusView } from '../../../src/webview_module/shared/messages.js';

/** Case-insensitive match on base label or root path. Empty query returns all. */
export function filterBases(bases: BaseStatusView[], query: string): BaseStatusView[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return bases;
    }
    return bases.filter(
        (base) => base.label.toLowerCase().includes(needle) || base.root.toLowerCase().includes(needle)
    );
}

export function baseStatusHint(base: BaseStatusView): string {
    const parts = [base.ready ? 'ready' : base.state];
    if (base.fileIssueCount > 0) {
        parts.push(`${base.fileIssueCount} issues`);
    }
    return parts.join(' · ');
}

export function baseOptionMeta(base: BaseStatusView): string {
    const parts = [
        base.ready ? 'ready' : base.state,
        `${base.ideaCount} ideas`,
        `${base.edgeCount} refs`
    ];
    if (base.fileIssueCount > 0) {
        parts.push(`${base.fileIssueCount} issues`);
    }
    return parts.join(' · ');
}

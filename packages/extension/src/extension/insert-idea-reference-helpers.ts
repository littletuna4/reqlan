/**
 * Pure helpers for placing idea-reference imports in .rq source text.
 * rq:["../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */

/** Line index where a new plain import should be inserted (after existing imports). */
export function findPlainImportInsertLine(text: string): number {
    const lines = text.split(/\r?\n/);
    let lastImport = -1;
    for (let index = 0; index < lines.length; index++) {
        const trimmed = lines[index]!.trimStart();
        if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
            lastImport = index;
            continue;
        }
        if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
            continue;
        }
        break;
    }
    return lastImport >= 0 ? lastImport + 1 : 0;
}

export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

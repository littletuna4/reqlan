/**
 * Pick the live workspace tab for a search/open hit.
 * rq:["../../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_open_live_file]
 */
export function pickOpenWorkspaceDocument<T extends { uri: { fsPath: string; toString(): string } }>(
    documents: readonly T[],
    target: { fsPath: string; toString(): string }
): T | undefined {
    const matches = documents.filter(document => document.uri.fsPath === target.fsPath);
    return matches.find(document => document.uri.toString() === target.toString()) ?? matches[0];
}

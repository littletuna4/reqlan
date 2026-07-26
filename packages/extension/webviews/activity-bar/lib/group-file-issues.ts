import type { FileIndexIssueView } from '../../../src/webview_module/shared/messages.js';

export interface FileIssueGroup {
    fileUri: string;
    label: string;
    issues: FileIndexIssueView[];
}

export function fileLabelFromIssue(issue: FileIndexIssueView): string {
    const match = issue.location.match(/^(.*):\d+:\d+$/);
    if (match?.[1]) {
        return match[1];
    }
    const path = issue.fileUri.replace(/^file:\/\/\/?/, '');
    const segments = path.split('/');
    return segments[segments.length - 1] || issue.fileUri;
}

export function groupFileIssuesByFile(issues: FileIndexIssueView[]): FileIssueGroup[] {
    const map = new Map<string, FileIssueGroup>();
    for (const issue of issues) {
        let group = map.get(issue.fileUri);
        if (!group) {
            group = {
                fileUri: issue.fileUri,
                label: fileLabelFromIssue(issue),
                issues: []
            };
            map.set(issue.fileUri, group);
        }
        group.issues.push(issue);
    }
    return [...map.values()];
}

/**
 * rq:["../../../../../reqlan rq/cli/diff.rq".diff_webview]
 * rq:["../../../../../reqlan rq/cli/diff.rq".diff_verbosity]
 */

export type DiffChange = 'created' | 'deleted' | 'modified' | 'moved';
export type DiffVerbosity = 'summary' | 'references' | 'text';

export interface DiffRowInput {
    change: DiffChange;
    name: string;
    file: string;
    fromFile?: string | null;
    references?: { added: string[]; removed: string[] } | null;
    text?: { before: string; after: string } | null;
}

export const DIFF_COLOR_TOKEN: Record<DiffChange, string> = {
    created: 'gitDecoration.addedResourceForeground',
    deleted: 'gitDecoration.deletedResourceForeground',
    modified: 'gitDecoration.modifiedResourceForeground',
    moved: 'gitDecoration.renamedResourceForeground'
};

/** CSS class for a change kind in the Diff Ideas panel. */
export const DIFF_CHANGE_CLASS: Record<DiffChange, string> = {
    created: 'kind-created',
    deleted: 'kind-deleted',
    modified: 'kind-modified',
    moved: 'kind-moved'
};

export function diffChangeClass(change: DiffChange): string {
    return DIFF_CHANGE_CLASS[change];
}

export interface DiffRowView {
    change: DiffChange;
    name: string;
    file: string;
    fromFile?: string;
    colorToken: string;
    added: string[];
    removed: string[];
    before?: string;
    after?: string;
}

export function diffRowView(row: DiffRowInput, verbosity: DiffVerbosity): DiffRowView {
    const showRefs = verbosity === 'references';
    const showText = verbosity === 'text' && row.change !== 'moved';
    return {
        change: row.change,
        name: row.name,
        file: row.file,
        fromFile: row.fromFile ?? undefined,
        colorToken: DIFF_COLOR_TOKEN[row.change],
        added: showRefs ? row.references?.added ?? [] : [],
        removed: showRefs ? row.references?.removed ?? [] : [],
        before: showText ? row.text?.before ?? '' : undefined,
        after: showText ? row.text?.after ?? '' : undefined
    };
}

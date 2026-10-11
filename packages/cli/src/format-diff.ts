/**
 * rq:["../../../reqlan rq/cli/diff.rq".diff]
 * rq:["../../../reqlan rq/cli/diff.rq".diff_verbosity]
 * rq:["../../../reqlan rq/cli/diff.rq".diff_cli_color]
 */

export type DiffChange = 'created' | 'deleted' | 'modified' | 'moved';
export type DiffVerbosity = 'summary' | 'references' | 'text';

export interface DiffReferences {
    added: string[];
    removed: string[];
}

export interface DiffText {
    before: string;
    after: string;
}

export interface DiffRow {
    change: DiffChange;
    name: string;
    file: string;
    fromFile?: string | null;
    references?: DiffReferences | null;
    text?: DiffText | null;
}

const COLOR: Record<DiffChange, string> = {
    created: '32',
    deleted: '31',
    modified: '33',
    moved: '36'
};

export function useDiffColor(options: {
    color: boolean | undefined;
    json: boolean;
    noColorEnv: boolean;
    isTTY: boolean;
}): boolean {
    if (options.json || options.color === false) {
        return false;
    }
    if (options.color === true) {
        return true;
    }
    if (options.noColorEnv) {
        return false;
    }
    return options.isTTY;
}

export function parseDiffVerbosity(flag: string | undefined, verbose: boolean, veryVerbose: boolean): DiffVerbosity | undefined {
    if (flag !== undefined) {
        const value = flag.trim().toLowerCase();
        if (value === 'summary' || value === 'references' || value === 'text') {
            return value;
        }
        return undefined;
    }
    if (veryVerbose) {
        return 'text';
    }
    if (verbose) {
        return 'references';
    }
    return 'summary';
}

export function plainDiffRows(rows: DiffRow[]): unknown[] {
    return rows.map(row => {
        const plain: Record<string, unknown> = {
            change: row.change,
            name: row.name,
            file: row.file
        };
        if (row.fromFile) {
            plain.fromFile = row.fromFile;
        }
        if (row.references) {
            plain.references = row.references;
        }
        if (row.text) {
            plain.text = row.text;
        }
        return plain;
    });
}

export function formatDiffHeader(from: string, to: string): string {
    return `Comparing ${from} -> ${to}`;
}

export function formatDiff(rows: DiffRow[], color: boolean, header?: string): string {
    const body = rows.map(row => formatRow(row, color)).join('\n');
    if (!header) {
        return body;
    }
    return body.length > 0 ? `${header}\n\n${body}` : header;
}

function formatRow(row: DiffRow, color: boolean): string {
    const path = row.change === 'moved' && row.fromFile ? `${row.fromFile} -> ${row.file}` : row.file;
    const summary = paint(`${row.change.padEnd(8)} ${row.name.padEnd(8)} ${path}`, COLOR[row.change], color);
    const lines = [summary];
    if (row.references) {
        for (const name of row.references.added) {
            lines.push(paint(`  + ${name}`, '32', color));
        }
        for (const name of row.references.removed) {
            lines.push(paint(`  - ${name}`, '31', color));
        }
    }
    if (row.change !== 'moved' && row.text) {
        for (const part of lineDiff(row.text.before, row.text.after)) {
            if (part.kind === 'add') {
                lines.push(paint(`+ ${part.text}`, '32', color));
            } else if (part.kind === 'del') {
                lines.push(paint(`- ${part.text}`, '31', color));
            } else {
                lines.push(`  ${part.text}`);
            }
        }
    }
    return lines.join('\n');
}

function paint(text: string, code: string, color: boolean): string {
    if (!color) {
        return text;
    }
    return `\x1b[${code}m${text}\x1b[0m`;
}

function lineDiff(before: string, after: string): Array<{ kind: 'add' | 'del' | 'ctx'; text: string }> {
    const left = before === '' ? [] : before.split('\n');
    const right = after === '' ? [] : after.split('\n');
    const table = lcs(left, right);
    const out: Array<{ kind: 'add' | 'del' | 'ctx'; text: string }> = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
        if (left[i] === right[j]) {
            out.push({ kind: 'ctx', text: left[i] });
            i += 1;
            j += 1;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            out.push({ kind: 'del', text: left[i] });
            i += 1;
        } else {
            out.push({ kind: 'add', text: right[j] });
            j += 1;
        }
    }
    while (i < left.length) {
        out.push({ kind: 'del', text: left[i] });
        i += 1;
    }
    while (j < right.length) {
        out.push({ kind: 'add', text: right[j] });
        j += 1;
    }
    return out;
}

function lcs(left: string[], right: string[]): number[][] {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
    for (let i = left.length - 1; i >= 0; i -= 1) {
        for (let j = right.length - 1; j >= 0; j -= 1) {
            table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }
    return table;
}

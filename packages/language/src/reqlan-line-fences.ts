/**
 * Same-line fences that hide `//` / `/*` so quoted and backticked examples stay prose.
 * Unclosed openers are not fences.
 * A CODE_FENCE opener is three backticks as the first non-whitespace on a line.
 * rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
 * rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
 */

function isLineStartAt(text: string, offset: number): boolean {
    let previousIndex = offset - 1;
    while (previousIndex >= 0 && (text[previousIndex] === ' ' || text[previousIndex] === '\t')) {
        previousIndex--;
    }
    return previousIndex < 0 || text[previousIndex] === '\n' || text[previousIndex] === '\r';
}

/** True when `offset` is a line-start ``` opener (optional indent). Mid-line ``` is prose. */
export function isCodeFenceOpen(text: string, offset: number): boolean {
    return text.startsWith('```', offset) && isLineStartAt(text, offset);
}

/** Offset after a ` ```…``` ` fence that starts at `openOffset`, or `text.length` if the fence has no close. */
export function codeFenceEnd(text: string, openOffset: number): number {
    if (!isCodeFenceOpen(text, openOffset)) {
        return openOffset;
    }
    const afterOpen = openOffset + 3;
    const firstNewline = text.indexOf('\n', afterOpen);
    if (firstNewline < 0) {
        const sameLineClose = text.indexOf('```', afterOpen);
        return sameLineClose < 0 ? text.length : sameLineClose + 3;
    }
    const close = findLineStartFence(text, firstNewline + 1);
    return close < 0 ? text.length : close + 3;
}

function findLineStartFence(text: string, from: number): number {
    for (let index = from; index <= text.length - 3; index++) {
        if (text.startsWith('```', index) && isLineStartAt(text, index)) {
            return index;
        }
    }
    return -1;
}

export function isInsideLineFence(text: string, offset: number): boolean {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    let lineEnd = text.indexOf('\n', lineStart);
    if (lineEnd < 0) {
        lineEnd = text.length;
    }
    if (lineEnd > lineStart && text[lineEnd - 1] === '\r') {
        lineEnd -= 1;
    }
    let index = lineStart;
    while (index < offset && index < lineEnd) {
        if (text.startsWith('```', index)) {
            index += 3;
            continue;
        }
        const end = closedFenceEnd(text, index, lineEnd);
        if (end !== undefined) {
            if (offset < end) {
                return true;
            }
            index = end;
            continue;
        }
        index += 1;
    }
    return false;
}

function closedFenceEnd(text: string, start: number, lineEnd: number): number | undefined {
    const open = text[start];
    if (open === '`') {
        const close = text.indexOf('`', start + 1);
        if (close > start + 1 && close < lineEnd) {
            return close + 1;
        }
        return undefined;
    }
    if (open !== '"' && open !== "'") {
        return undefined;
    }
    let index = start + 1;
    while (index < lineEnd) {
        const char = text[index];
        if (char === '\\') {
            index += 2;
            continue;
        }
        if (char === open) {
            return index + 1;
        }
        index += 1;
    }
    return undefined;
}

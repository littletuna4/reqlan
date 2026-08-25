/**
 * Same-line fences that hide `//` / `/*` so quoted and backticked examples stay prose.
 * Unclosed openers are not fences.
 * rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
 */

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

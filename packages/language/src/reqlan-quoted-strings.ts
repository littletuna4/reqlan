/**
 * Shared helpers for reqlan double- and single-quoted string literals.
 */

/** Capturing group for one quoted string (double or single). */
export const REQLAN_QUOTED_STRING_CAPTURE = '(?:"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')';

export const REQLAN_QUOTED_STRING_PATTERN = new RegExp(REQLAN_QUOTED_STRING_CAPTURE, 'g');

export function reqlanStringDelimiter(text: string): '"' | "'" | undefined {
    if (text.startsWith('"')) {
        return '"';
    }
    if (text.startsWith("'")) {
        return "'";
    }
    return undefined;
}

export function unquoteReqlanString(text: string): string {
    const delimiter = reqlanStringDelimiter(text);
    if (!delimiter || !text.endsWith(delimiter)) {
        return text;
    }
    return text.slice(1, -1).replace(/\\(.)/g, '$1');
}

export function parseReqlanQuotedString(quoted: string): string {
    return unquoteReqlanString(quoted);
}

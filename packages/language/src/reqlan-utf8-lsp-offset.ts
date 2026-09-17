/**
 * Native extract spans are UTF-8 byte offsets. LSP `Position.character` and
 * `TextDocument.positionAt` use UTF-16 code units. Convert before mapping a
 * reference underline onto the editor so non-ASCII text does not shift it.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_underline_syntax_align]
 */

/** Convert a UTF-8 byte offset into a UTF-16 code-unit offset in `text`. */
export function utf8ByteOffsetToUtf16(text: string, byteOffset: number): number {
    if (byteOffset <= 0) {
        return 0;
    }
    let bytes = 0;
    let units = 0;
    const length = text.length;
    while (units < length) {
        const code = text.charCodeAt(units)!;
        let charBytes: number;
        let charUnits = 1;
        if (code <= 0x7F) {
            charBytes = 1;
        } else if (code <= 0x7FF) {
            charBytes = 2;
        } else if (code >= 0xD800 && code <= 0xDBFF && units + 1 < length) {
            const low = text.charCodeAt(units + 1)!;
            if (low >= 0xDC00 && low <= 0xDFFF) {
                charBytes = 4;
                charUnits = 2;
            } else {
                charBytes = 3;
            }
        } else {
            charBytes = 3;
        }
        if (bytes + charBytes > byteOffset) {
            return units;
        }
        bytes += charBytes;
        units += charUnits;
        if (bytes === byteOffset) {
            return units;
        }
    }
    return length;
}

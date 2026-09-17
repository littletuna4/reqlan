/**
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_underline_syntax_align]
 */
import { describe, expect, test } from 'vitest';
import { utf8ByteOffsetToUtf16 } from '../src/reqlan-utf8-lsp-offset.js';

function assertUtf8MapsToUtf16(text: string, utf16Index: number): void {
    const prefix = text.slice(0, utf16Index);
    const bytes = Buffer.byteLength(prefix, 'utf8');
    expect(utf8ByteOffsetToUtf16(text, bytes)).toBe(utf16Index);
}

describe('utf8 LSP offset conversion', () => {
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_underline_syntax_align]
    test('ASCII offsets match UTF-16', () => {
        const text = 'see [alpha]';
        for (let index = 0; index <= text.length; index++) {
            assertUtf8MapsToUtf16(text, index);
        }
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_underline_syntax_align]
    test('converts 2-byte, 3-byte, and 4-byte UTF-8 before a reference', () => {
        const text = 'café — 你好 😀 then [alpha]';
        const name = text.indexOf('alpha');
        expect(name).toBeGreaterThan(0);
        assertUtf8MapsToUtf16(text, name);
        assertUtf8MapsToUtf16(text, name + 'alpha'.length);
        for (const index of [0, 1, text.indexOf('é'), text.indexOf('你'), text.indexOf('😀'), text.length]) {
            assertUtf8MapsToUtf16(text, index);
        }
        const cafeBytes = Buffer.byteLength('café', 'utf8');
        expect(cafeBytes).toBe(5);
        expect('café'.length).toBe(4);
        expect(utf8ByteOffsetToUtf16(text, cafeBytes)).toBe(4);
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_underline_syntax_align]
    test('clamps offsets past the end of the string', () => {
        expect(utf8ByteOffsetToUtf16('ab', 99)).toBe(2);
        expect(utf8ByteOffsetToUtf16('', 1)).toBe(0);
        expect(utf8ByteOffsetToUtf16('é', 1)).toBe(0);
    });
});

/**
 * Helpers for markdown-style links `[label](target)` in requirement prose.
 */
import type { CstNode, LangiumDocument } from 'langium';
import { CstUtils } from 'langium';
import type { Position } from 'vscode-languageserver';
import { isMarkdownLink } from './generated/ast.js';
import { parseMarkdownLink } from './reqlan-references.js';

const MARKDOWN_LINK_IN_TEXT_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

export function markdownLinkLabelRange(raw: string, linkOffset: number): { start: number; end: number } | undefined {
    const parsed = parseMarkdownLink(raw);
    if (!parsed) {
        return undefined;
    }
    return {
        start: linkOffset + 1,
        end: linkOffset + 1 + parsed.label.length
    };
}

export function markdownLinkTargetRange(raw: string, linkOffset: number): { start: number; end: number } | undefined {
    const parsed = parseMarkdownLink(raw);
    if (!parsed) {
        return undefined;
    }
    const targetStart = raw.indexOf('](') + 2;
    return {
        start: linkOffset + targetStart,
        end: linkOffset + targetStart + parsed.target.length
    };
}

export function isOffsetInsideRange(offset: number, start: number, end: number): boolean {
    return offset >= start && offset < end;
}

export function isMarkdownLinkLabelPosition(document: LangiumDocument, position: Position): boolean {
    const offset = document.textDocument.offsetAt(position);
    const root = document.parseResult.value.$cstNode;
    if (root) {
        const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
        let current: CstNode | undefined = leaf;
        while (current) {
            if (isMarkdownLink(current.astNode)) {
                const labelRange = markdownLinkLabelRange(current.astNode.raw, current.offset);
                if (labelRange && isOffsetInsideRange(offset, labelRange.start, labelRange.end)) {
                    return true;
                }
                return false;
            }
            current = current.container;
        }
    }
    return isMarkdownLinkLabelOffsetInText(document.textDocument.getText(), offset);
}

export function isMarkdownLinkTargetPosition(document: LangiumDocument, position: Position): boolean {
    const offset = document.textDocument.offsetAt(position);
    const root = document.parseResult.value.$cstNode;
    if (!root) {
        return false;
    }
    const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
    let current: CstNode | undefined = leaf;
    while (current) {
        if (isMarkdownLink(current.astNode)) {
            const targetRange = markdownLinkTargetRange(current.astNode.raw, current.offset);
            return targetRange ? isOffsetInsideRange(offset, targetRange.start, targetRange.end) : false;
        }
        current = current.container;
    }
    return false;
}

export function isMarkdownLinkLabelOffsetInText(text: string, offset: number): boolean {
    for (const span of iterateMarkdownLinkSpans(text)) {
        if (isOffsetInsideRange(offset, span.labelStart, span.labelEnd)) {
            return true;
        }
    }
    return false;
}

export function isRangeInsideMarkdownLinkLabel(text: string, start: number, end: number): boolean {
    for (const span of iterateMarkdownLinkSpans(text)) {
        if (start >= span.labelStart && end <= span.labelEnd) {
            return true;
        }
    }
    return false;
}

export interface MarkdownLinkSpan {
    rawStart: number;
    rawEnd: number;
    labelStart: number;
    labelEnd: number;
    targetStart: number;
    targetEnd: number;
}

export function iterateMarkdownLinkSpans(text: string): MarkdownLinkSpan[] {
    const spans: MarkdownLinkSpan[] = [];
    MARKDOWN_LINK_IN_TEXT_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MARKDOWN_LINK_IN_TEXT_PATTERN.exec(text)) !== null) {
        const rawStart = match.index;
        const labelStart = rawStart + 1;
        const labelEnd = labelStart + match[1]!.length;
        const targetStart = labelEnd + 2;
        const targetEnd = targetStart + match[2]!.length;
        spans.push({
            rawStart,
            rawEnd: targetEnd + 1,
            labelStart,
            labelEnd,
            targetStart,
            targetEnd
        });
    }
    return spans;
}

export function linePrefixBeforeMarkdownLinkTarget(document: LangiumDocument, position: Position): boolean {
    const linePrefix = document.textDocument.getText({
        start: { line: position.line, character: 0 },
        end: position
    });
    const afterCursor = document.textDocument.getText({
        start: position,
        end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
    });
    return /\[[^\]]*$/.test(linePrefix) && /^\]\(/.test(afterCursor);
}

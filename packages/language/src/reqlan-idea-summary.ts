/**
 * Compact idea body summaries for inline editor hints.
 */
import {
    isBodyLine,
    isBracketReference,
    isIdea,
    isMarkdownLink,
    isOneLinerIdea,
    isRichTextPart,
    isWikiLink,
    type BodyLine,
    type IdeaDeclaration,
    type OneLinerIdea
} from './generated/ast.js';
import { parseMarkdownLink } from './reqlan-references.js';

function summarizeOneLinerPart(part: OneLinerIdea['body']['content'][number]): string {
    if (typeof part === 'string') {
        return part;
    }
    if (isMarkdownLink(part)) {
        return parseMarkdownLink(part.raw)?.label ?? part.raw;
    }
    if (isWikiLink(part) || isBracketReference(part)) {
        return '[ref]';
    }
    return '';
}

function summarizeRichTextPart(part: BodyLine['parts'][number]): string {
    if (typeof part === 'string') {
        return part;
    }
    if (isRichTextPart(part) && part.$type === 'RichTextPart') {
        return part.text ?? part.inlineCode ?? part.punct ?? part.lparen ?? part.rparen ?? '';
    }
    if (isMarkdownLink(part)) {
        return parseMarkdownLink(part.raw)?.label ?? part.raw;
    }
    if (isWikiLink(part) || isBracketReference(part)) {
        return '[ref]';
    }
    return '';
}

function summarizeOneLinerBody(idea: OneLinerIdea): string {
    return idea.body.content
        .map(summarizeOneLinerPart)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function summarizeBlockIdeaBody(idea: IdeaDeclaration): string {
    if (!isIdea(idea)) {
        return '';
    }
    const lines: string[] = [];
    for (const element of idea.elements) {
        if (!isBodyLine(element)) {
            continue;
        }
        const line = element.parts
            .map(summarizeRichTextPart)
            .filter(part => part.length > 0)
            .join(' ')
            .replace(/\s+([.,!?;:])/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
        if (line) {
            lines.push(line);
        }
    }
    return lines.join('\n');
}

export function summarizeIdeaDeclaration(idea: IdeaDeclaration): string {
    if (isOneLinerIdea(idea)) {
        return summarizeOneLinerBody(idea);
    }
    if (isIdea(idea)) {
        return summarizeBlockIdeaBody(idea);
    }
    return '';
}

export function truncateSummary(text: string, maxLength = 80): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

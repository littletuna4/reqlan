/**
 * Compact idea body summaries for inline editor hints and indexing.
 */
import {
    isBodyLine,
    isBracketReference,
    isFileReference,
    isFileSymbolReference,
    isIdea,
    isLocalReference,
    isMarkdownLink,
    isOneLinerIdea,
    isQualifiedReference,
    isRichTextPart,
    isWikiLink,
    type BodyLine,
    type BracketReference,
    type IdeaDeclaration,
    type OneLinerIdea,
    type ReferenceTarget,
    type WikiLink
} from './generated/ast.js';
import { parseMarkdownLink, referenceIdea, unquoteReqlanString } from './reqlan-references.js';

/** Preserve the source token so consumers can restyle/link refs (not a bare "[ref]"). */
function summarizeReferencePart(part: WikiLink | BracketReference): string {
    const raw = part.$cstNode?.text?.replace(/\s+/g, ' ').trim();
    if (raw) {
        return raw;
    }
    const label = referenceDisplayName(part);
    if (isWikiLink(part)) {
        return label ? `[[${label}]]` : '[ref]';
    }
    return label ? `[${label}]` : '[ref]';
}

function wikiAliasText(part: WikiLink): string | undefined {
    const alias = part.alias
        ?.map(piece => piece.text ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    return alias || undefined;
}

function referenceTargetLabel(target: ReferenceTarget | undefined): string | undefined {
    if (!target) {
        return undefined;
    }
    if (isFileReference(target)) {
        return fileBaseName(unquoteReqlanString(target.file));
    }
    if (isFileSymbolReference(target)) {
        return fileBaseName(unquoteReqlanString(target.file));
    }
    if (isQualifiedReference(target) || isLocalReference(target)) {
        const idea = referenceIdea(target);
        const name = idea?.ref?.name ?? idea?.$refText;
        if (name) {
            return name;
        }
    }
    return target.$cstNode?.text?.replace(/\s+/g, ' ').trim();
}

function referenceDisplayName(part: WikiLink | BracketReference): string | undefined {
    if (isWikiLink(part)) {
        const alias = wikiAliasText(part);
        if (alias) {
            return alias;
        }
    }
    return referenceTargetLabel(part.target);
}

function fileBaseName(path: string): string {
    const cleaned = path.trim();
    const segments = cleaned.split(/[/\\]/).filter(Boolean);
    return segments[segments.length - 1] || cleaned;
}

function summarizeOneLinerPart(part: NonNullable<OneLinerIdea['body']>['content'][number]): string {
    if (typeof part === 'string') {
        return part;
    }
    if (isMarkdownLink(part)) {
        return parseMarkdownLink(part.raw)?.label ?? part.raw;
    }
    if (isWikiLink(part) || isBracketReference(part)) {
        return summarizeReferencePart(part);
    }
    return '';
}

function summarizeRichTextPart(part: BodyLine['parts'][number]): string {
    if (typeof part === 'string') {
        return part;
    }
    if (isRichTextPart(part) && part.$type === 'RichTextPart') {
        return part.text ?? part.inlineCode ?? part.lparen ?? part.rparen ?? '';
    }
    if (isMarkdownLink(part)) {
        return parseMarkdownLink(part.raw)?.label ?? part.raw;
    }
    if (isWikiLink(part) || isBracketReference(part)) {
        return summarizeReferencePart(part);
    }
    return '';
}

function summarizeOneLinerBody(idea: OneLinerIdea): string {
    if (!idea.body) {
        return '';
    }
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

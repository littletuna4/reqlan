/**
 * Shared helpers for the reference target union types.
 */
import type { Reference } from 'langium';
import {
    isFileReference,
    isFileSymbolReference,
    isLocalReference,
    isQualifiedReference,
    type IdeaDeclaration,
    type Import,
    type QualifiedReference,
    type ReferenceTarget
} from './generated/ast.js';

export function referenceImport(target: ReferenceTarget): Reference<Import> | undefined {
    if (isQualifiedReference(target)) {
        return target.path?.ref || target.qualifier?.ref ? (target.path ?? target.qualifier) : undefined;
    }
    return undefined;
}

export function referenceIdea(target: ReferenceTarget): Reference<IdeaDeclaration> | undefined {
    if (isQualifiedReference(target) || isLocalReference(target)) {
        return target.idea;
    }
    return undefined;
}

export function referenceFilePath(target: ReferenceTarget): string | undefined {
    if (isFileReference(target) || isFileSymbolReference(target)) {
        return target.file;
    }
    if (isQualifiedReference(target)) {
        return qualifiedReferenceImportPath(target);
    }
    return undefined;
}

export function qualifiedReferenceImportPath(reference: QualifiedReference): string | undefined {
    if (reference.qualifier?.ref) {
        return reference.qualifier.ref.path;
    }
    if (reference.path?.ref) {
        return reference.path.ref.path;
    }
    if (reference.path?.$refText) {
        return unquoteReqlanString(reference.path.$refText);
    }
    return undefined;
}

export function isAnonymousQualifiedReference(reference: QualifiedReference): boolean {
    return reference.path !== undefined && reference.path.ref === undefined && reference.qualifier === undefined;
}

export function unquoteReqlanString(text: string): string {
    if (!text.startsWith('"') || !text.endsWith('"')) {
        return text;
    }
    return text.slice(1, -1).replace(/\\(.)/g, '$1');
}

export interface ParsedMarkdownLink {
    label: string;
    target: string;
}

const MARKDOWN_LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;

export function parseMarkdownLink(raw: string): ParsedMarkdownLink | undefined {
    const match = MARKDOWN_LINK_PATTERN.exec(raw);
    if (!match) {
        return undefined;
    }
    return {
        label: match[1]!,
        target: match[2]!
    };
}

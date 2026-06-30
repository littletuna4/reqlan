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
    type ReferenceTarget
} from './generated/ast.js';

export function referenceImport(target: ReferenceTarget): Reference<Import> | undefined {
    if (isQualifiedReference(target)) {
        return target.path ?? target.qualifier;
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
    return undefined;
}

/**
 * Build text edits that rename idea tokens inside `rq:[...]` comment references.
 * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_rename]
 * rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
 */
import type { Range } from 'vscode-languageserver';
import { findCommentReferencesInText, type EmbeddedCommentReference } from './reqlan-comment-resolver.js';
import { parseReqlanQuotedString, REQLAN_QUOTED_STRING_CAPTURE } from './reqlan-quoted-strings.js';
import type { PathRewriteEdit } from './file-path-rewrite.js';

const QUALIFIED_TARGET_PATTERN = new RegExp(
    `^(${REQLAN_QUOTED_STRING_CAPTURE})\\s*\\.\\s*([_a-zA-Z][\\w-]*)(?:\\s*\\.\\s*([_a-zA-Z][\\w-]*))?$`
);

export interface CommentIdeaRenameMatch {
    range: Range;
    path?: string;
    idea: string;
}

/**
 * Locate idea-name ranges inside comment references that should rename with `oldName`.
 * When `targetPath` is set, only qualified refs whose path equals that value (or pathless
 * local refs when `includePathless` is true) are included.
 */
export function findCommentIdeaRenameMatches(
    text: string,
    oldName: string,
    options?: {
        targetPath?: string;
        includePathless?: boolean;
        lineOffset?: number;
    }
): CommentIdeaRenameMatch[] {
    const matches: CommentIdeaRenameMatch[] = [];
    const includePathless = options?.includePathless ?? true;
    for (const reference of findCommentReferencesInText(text, options?.lineOffset ?? 0)) {
        if (reference.idea !== oldName) {
            continue;
        }
        if (reference.path !== undefined) {
            if (options?.targetPath !== undefined && !pathsMatch(reference.path, options.targetPath)) {
                continue;
            }
        } else if (!includePathless) {
            continue;
        }
        const ideaRange = ideaTokenRangeInCommentReference(text, reference);
        if (!ideaRange) {
            continue;
        }
        matches.push({
            range: ideaRange,
            path: reference.path,
            idea: reference.idea
        });
    }
    return matches;
}

export function findCommentIdeaRenameEdits(
    text: string,
    oldName: string,
    newName: string,
    options?: {
        targetPath?: string;
        includePathless?: boolean;
        lineOffset?: number;
    }
): PathRewriteEdit[] {
    if (oldName === newName) {
        return [];
    }
    return findCommentIdeaRenameMatches(text, oldName, options).map(match => ({
        range: match.range,
        newText: newName
    }));
}

export function ideaTokenRangeInCommentReference(
    text: string,
    reference: EmbeddedCommentReference
): Range | undefined {
    const startOffset = offsetAt(text, reference.range.start);
    const endOffset = offsetAt(text, reference.range.end);
    const segment = text.slice(startOffset, endOffset);
    const bracket = /rq:\s*\[([^\]]+)\]/.exec(segment);
    if (!bracket || bracket.index === undefined) {
        return undefined;
    }
    const target = bracket[1]!;
    const bracketContentStart = startOffset + bracket.index + bracket[0].indexOf('[') + 1;
    const qualified = QUALIFIED_TARGET_PATTERN.exec(target.trim());
    if (qualified) {
        const ideaToken = qualified[3] ?? qualified[2]!;
        if (ideaToken !== reference.idea) {
            return undefined;
        }
        const ideaIndexInTarget = target.lastIndexOf(ideaToken);
        if (ideaIndexInTarget < 0) {
            return undefined;
        }
        const absolute = bracketContentStart + ideaIndexInTarget;
        return {
            start: offsetToPosition(text, absolute),
            end: offsetToPosition(text, absolute + ideaToken.length)
        };
    }
    const ideaIndex = target.indexOf(reference.idea);
    if (ideaIndex < 0) {
        return undefined;
    }
    const absolute = bracketContentStart + ideaIndex;
    return {
        start: offsetToPosition(text, absolute),
        end: offsetToPosition(text, absolute + reference.idea.length)
    };
}

function pathsMatch(left: string, right: string): boolean {
    const normalize = (path: string) => {
        try {
            return parseReqlanQuotedString(JSON.stringify(path)).replace(/\\/g, '/');
        } catch {
            return path.replace(/\\/g, '/');
        }
    };
    const a = normalize(left);
    const b = normalize(right);
    return a === b
        || a.replace(/\.rq$/i, '') === b.replace(/\.rq$/i, '')
        || a.endsWith(b)
        || b.endsWith(a);
}

function offsetAt(text: string, position: { line: number; character: number }): number {
    const lines = text.split(/\r?\n/);
    let offset = 0;
    for (let index = 0; index < position.line; index++) {
        offset += lines[index]!.length + 1;
    }
    return offset + position.character;
}

function offsetToPosition(text: string, offset: number): { line: number; character: number } {
    const before = text.slice(0, offset);
    const lines = before.split(/\r?\n/);
    return {
        line: lines.length - 1,
        character: lines[lines.length - 1]!.length
    };
}

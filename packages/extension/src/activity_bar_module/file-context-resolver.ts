/**
 * Resolves requirement links for any workspace file (not only .rq).
 */
import { dirname, posix } from 'node:path';
import { findCommentReferencesInText } from 'reqlan-language';
import {
    ideaId,
    resolveWorkspaceFileUri,
    type FileRelatedRequirements,
    type IdeaSummary,
    type IdeaWithRange,
    type SqliteIndexStore
} from 'reqlan-analytical';

export interface ResolvedFileContext extends FileRelatedRequirements {
    commentLinkedIdeas: IdeaSummary[];
}

export async function enrichFileContext(
    store: SqliteIndexStore,
    fileUri: string,
    fileRelated: FileRelatedRequirements,
    options?: { fileText?: string; workspaceRoot?: string }
): Promise<ResolvedFileContext> {
    const commentFromText =
        options?.fileText !== undefined
            ? await resolveCommentLinkedIdeas(store, fileUri, options.fileText, options.workspaceRoot)
            : [];

    return {
        ...fileRelated,
        commentLinkedIdeas: dedupeIdeas([...fileRelated.commentLinkedIdeas, ...commentFromText])
    };
}

export async function resolveCommentLinkedIdeas(
    store: SqliteIndexStore,
    fileUri: string,
    fileText: string,
    workspaceRoot?: string
): Promise<IdeaSummary[]> {
    const refs = findCommentReferencesInText(fileText);
    const ideas: IdeaSummary[] = [];
    const seen = new Set<string>();

    for (const ref of refs) {
        const targetFile = ref.path
            ? resolveWorkspaceFileUri(
                posix.normalize(posix.join(dirname(fileUri.replace(/\\/g, '/')), ref.path)),
                workspaceRoot
            )
            : fileUri.endsWith('.rq')
                ? fileUri
                : undefined;
        if (!targetFile) {
            continue;
        }
        const id = ideaId(targetFile, ref.idea);
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        const idea = await store.getIdea(id);
        if (idea) {
            ideas.push(idea);
        }
    }

    return ideas;
}

export function dedupeIdeas(ideas: IdeaSummary[]): IdeaSummary[] {
    const seen = new Set<string>();
    const result: IdeaSummary[] = [];
    for (const idea of ideas) {
        if (seen.has(idea.id)) {
            continue;
        }
        seen.add(idea.id);
        result.push(idea);
    }
    return result;
}

export function ideasInSelectionRange(
    ideas: Array<{ lineStart: number; lineEnd: number } & IdeaSummary>,
    startLine: number,
    endLine: number
): IdeaSummary[] {
    const minLine = Math.min(startLine, endLine);
    const maxLine = Math.max(startLine, endLine);
    return ideas.filter(idea => idea.lineStart <= maxLine && idea.lineEnd >= minLine);
}

/** Innermost idea whose line range contains `line` (0-based). */
export function findIdeaAtLine(ideas: IdeaWithRange[], line: number): IdeaSummary | undefined {
    let match: IdeaWithRange | undefined;
    for (const idea of ideas) {
        if (idea.lineStart <= line && line <= idea.lineEnd) {
            if (!match || idea.lineStart > match.lineStart) {
                match = idea;
            }
        }
    }
    return match;
}

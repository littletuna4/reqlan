/**
 * The rust client syncs .rq files.
 * The rust client syncs other files only when the text contains rq:.
 * rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */
import { isCommentReferenceHostLanguage } from './comment-reference-languages.js';

const RQ_MARKER = 'rq:';

export function isDocumentSyncCandidate(languageId: string): boolean {
    return languageId === 'reqlan' || isCommentReferenceHostLanguage(languageId);
}

export function shouldSyncDocument(languageId: string, text: string): boolean {
    if (languageId === 'reqlan') {
        return true;
    }
    if (!isCommentReferenceHostLanguage(languageId)) {
        return false;
    }
    return text.includes(RQ_MARKER);
}

export type DocumentSyncEvent = 'open' | 'change' | 'close';

/** `forward` sends the editor event. `full` sends the whole buffer. `drop` ends the sync. */
export type DocumentSyncAction = 'skip' | 'forward' | 'full' | 'drop';

export function documentSyncAction(
    languageId: string,
    text: string,
    wasSynced: boolean,
    event: DocumentSyncEvent
): DocumentSyncAction {
    if (event === 'close') {
        return wasSynced ? 'drop' : 'skip';
    }
    const sync = shouldSyncDocument(languageId, text);
    if (event === 'open') {
        return sync ? 'forward' : 'skip';
    }
    if (!sync) {
        return wasSynced ? 'drop' : 'skip';
    }
    return wasSynced ? 'forward' : 'full';
}

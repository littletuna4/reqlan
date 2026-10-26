/**
 * rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */
import { describe, expect, test } from 'vitest';
import {
    documentSyncAction,
    isDocumentSyncCandidate,
    shouldSyncDocument
} from '../src/extension/document-sync.js';

describe('document sync', () => {
    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
    test('syncs reqlan files and other files only when the text contains rq:', () => {
        expect(isDocumentSyncCandidate('reqlan')).toBe(true);
        expect(isDocumentSyncCandidate('typescript')).toBe(true);
        expect(isDocumentSyncCandidate('log')).toBe(false);
        expect(isDocumentSyncCandidate('git-commit')).toBe(false);

        expect(shouldSyncDocument('reqlan', 'idea alpha {}')).toBe(true);
        expect(shouldSyncDocument('typescript', 'const x = 1;\n')).toBe(false);
        expect(shouldSyncDocument('typescript', '// rq:[alpha]\n')).toBe(true);
        expect(shouldSyncDocument('python', 'x = "rq:"\n')).toBe(true);
        expect(shouldSyncDocument('typescript', 'request()\n')).toBe(false);
        expect(shouldSyncDocument('log', 'rq:[alpha]\n')).toBe(false);
        expect(shouldSyncDocument('git-commit', 'rq:[alpha]\n')).toBe(false);
        expect(shouldSyncDocument('search-result', 'rq:\n')).toBe(false);
    });

    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
    test('sends the full text when a later edit adds rq:', () => {
        const plain = 'const x = 1;\n';
        const marked = 'const x = 1;\n// rq:[alpha]\n';

        expect(documentSyncAction('typescript', plain, false, 'open')).toBe('skip');
        expect(documentSyncAction('typescript', marked, false, 'open')).toBe('forward');
        expect(documentSyncAction('typescript', marked, false, 'change')).toBe('full');
        expect(documentSyncAction('typescript', marked, true, 'change')).toBe('forward');
        expect(documentSyncAction('typescript', plain, true, 'change')).toBe('drop');
        expect(documentSyncAction('typescript', plain, false, 'change')).toBe('skip');
        expect(documentSyncAction('typescript', marked, true, 'close')).toBe('drop');
        expect(documentSyncAction('typescript', marked, false, 'close')).toBe('skip');

        expect(documentSyncAction('reqlan', plain, false, 'open')).toBe('forward');
        expect(documentSyncAction('reqlan', plain, true, 'change')).toBe('forward');
        expect(documentSyncAction('reqlan', plain, false, 'change')).toBe('full');
        expect(documentSyncAction('reqlan', plain, true, 'close')).toBe('drop');
        expect(documentSyncAction('log', marked, false, 'open')).toBe('skip');
        expect(documentSyncAction('log', marked, false, 'change')).toBe('skip');
        expect(documentSyncAction('log', marked, true, 'change')).toBe('drop');
    });
});

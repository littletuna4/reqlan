/**
 * File document links stay out of the editor.
 * A file link is always underlined, and its fragment URI opens another editor.
 * Ctrl+hover uses the existing definition request. The reference is one word, so that
 * underline covers it, and Ctrl+click follows it in the active editor.
 * Web URLs and command links (folder, wildcard) stay document links.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */

const EDITOR_DOCUMENT_LINK_SCHEMES = new Set(['http', 'https', 'command']);

export function keepEditorDocumentLink(scheme: string | undefined): boolean {
    return scheme !== undefined && EDITOR_DOCUMENT_LINK_SCHEMES.has(scheme);
}

export function editorDocumentLinks<T extends { target?: { scheme: string } | undefined }>(
    links: readonly T[]
): T[] {
    return links.filter(link => keepEditorDocumentLink(link.target?.scheme));
}

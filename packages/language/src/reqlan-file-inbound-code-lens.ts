/**
 * File-top CodeLens listing inbound file_reference referencers.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
 */
import { Command, type CodeLens } from 'vscode-languageserver';
import { formatInboundReferencedByTitle } from './reqlan-inbound-reference-inlay-label.js';
import { REQLAN_INBOUND_FILE_REFERENCES_SUMMARY_COMMAND } from './reqlan-inlay-hint-settings.js';
import { sharedInboundSnapshot } from './reqlan-inbound-snapshot.js';

export function buildFileInboundCodeLens(documentUri: string): CodeLens | undefined {
    const snapshot = sharedInboundSnapshot.getForDocument(documentUri);
    const referencers = sharedInboundSnapshot.referencersForFile(documentUri);
    const title = formatInboundReferencedByTitle(referencers.map(item => item.name));
    if (!title) {
        return undefined;
    }
    return {
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
        },
        command: Command.create(
            title,
            REQLAN_INBOUND_FILE_REFERENCES_SUMMARY_COMMAND,
            documentUri,
            snapshot?.indexedUri ?? documentUri
        )
    };
}

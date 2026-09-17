/**
 * Host CodeLens for inbound file_reference lists on non-`.rq` editors.
 * `.rq` files use the language-server CodeLens so the lens is not duplicated.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
 */
import * as vscode from 'vscode';
import {
    formatInboundReferencedByTitle,
    REQLAN_INBOUND_FILE_REFERENCES_SUMMARY_COMMAND,
    type InboundFileSnapshot
} from '@reqlan/language';

export class FileInboundCodeLensProvider implements vscode.CodeLensProvider {
    private readonly changeEmitter = new vscode.EventEmitter<void>();
    private snapshots = new Map<string, InboundFileSnapshot>();

    readonly onDidChangeCodeLenses = this.changeEmitter.event;

    updateSnapshots(snapshots: readonly InboundFileSnapshot[]): void {
        this.snapshots = new Map(snapshots.map(snapshot => [snapshot.documentUri, snapshot]));
        this.changeEmitter.fire();
    }

    dispose(): void {
        this.changeEmitter.dispose();
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (isReqlanDocument(document)) {
            return [];
        }
        const snapshot = this.snapshots.get(document.uri.toString());
        const names = (snapshot?.fileReferencers ?? []).map(row => row.name);
        const title = formatInboundReferencedByTitle(names);
        if (!title) {
            return [];
        }
        return [
            new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                title,
                command: REQLAN_INBOUND_FILE_REFERENCES_SUMMARY_COMMAND,
                arguments: [document.uri.toString(), snapshot?.indexedUri ?? document.uri.toString()]
            })
        ];
    }
}

export function isReqlanDocument(document: vscode.TextDocument): boolean {
    return document.languageId === 'reqlan' || document.uri.path.endsWith('.rq');
}

export function registerFileInboundCodeLens(
    context: vscode.ExtensionContext,
    provider: FileInboundCodeLensProvider
): void {
    context.subscriptions.push(
        provider,
        vscode.languages.registerCodeLensProvider({ scheme: 'file' }, provider)
    );
}

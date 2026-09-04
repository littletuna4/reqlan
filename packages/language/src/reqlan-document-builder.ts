/**
 * Rebuilds documents whose comment-reference diagnostics depend on other `.rq` files.
 * Relink and validate attach to the current AST. They do not replace `parseResult`.
 * rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
 */
import {
    DefaultDocumentBuilder,
    type LangiumDocument,
    type LangiumSharedCoreServices
} from 'langium';
import { shouldRelinkCommentReferences } from './reqlan-comment-diagnostics.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';

export class ReqlanDocumentBuilder extends DefaultDocumentBuilder {
    constructor(services: LangiumSharedCoreServices) {
        super(services);
    }

    protected override shouldRelink(document: LangiumDocument, changedUris: Set<string>): boolean {
        if (super.shouldRelink(document, changedUris)) {
            return true;
        }
        return shouldRelinkCommentReferences(
            document,
            changedUris,
            pathResolveContextFromServices({
                shared: {
                    workspace: {
                        WorkspaceManager: this.workspaceManager(),
                        FileSystemProvider: this.fileSystemProvider
                    }
                }
            })
        );
    }
}

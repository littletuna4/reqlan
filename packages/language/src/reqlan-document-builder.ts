/**
 * Rebuilds documents whose outbound or comment-reference diagnostics depend on other `.rq` files.
 * Relink and validate attach to the current AST. They do not replace `parseResult`.
 * Do not relink every document that still has a Langium linker error.
 * rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
 */
import {
    DefaultDocumentBuilder,
    type LangiumDocument,
    type LangiumSharedCoreServices
} from 'langium';
import { shouldRelinkCommentReferences } from './reqlan-comment-diagnostics.js';
import { documentOutboundTouchesChangedUris } from './reqlan-local-symbolic-links.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';

export class ReqlanDocumentBuilder extends DefaultDocumentBuilder {
    constructor(services: LangiumSharedCoreServices) {
        super(services);
    }

    protected override shouldRelink(document: LangiumDocument, changedUris: Set<string>): boolean {
        if (this.indexManager.isAffected(document, changedUris)) {
            return true;
        }
        const pathContext = pathResolveContextFromServices({
            shared: {
                workspace: {
                    WorkspaceManager: this.workspaceManager(),
                    FileSystemProvider: this.fileSystemProvider
                }
            }
        });
        if (shouldRelinkCommentReferences(document, changedUris, pathContext)) {
            return true;
        }
        return documentOutboundTouchesChangedUris(document, changedUris, pathContext);
    }
}

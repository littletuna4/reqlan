import {
    DefaultWorkspaceManager,
    type LangiumDocument,
    type LangiumSharedCoreServices,
    type Stream,
    type URI
} from 'langium';

/**
 * Loads workspace documents independently so one catastrophic parse failure
 * (for example Chevrotain recovery stack overflow) cannot abort LSP workspace init.
 * rq:["../../../reqlan rq/language/syntax.rq".no_name_idea_safe_warning]
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 */
export class ReqlanWorkspaceManager extends DefaultWorkspaceManager {
    constructor(services: LangiumSharedCoreServices) {
        super(services);
    }

    protected override async loadWorkspaceDocuments(
        uris: Stream<URI>,
        collector: (document: LangiumDocument) => void
    ): Promise<void> {
        await Promise.all(
            uris.map(async uri => {
                try {
                    const document = await this.langiumDocuments.getOrCreateDocument(uri);
                    collector(document);
                } catch (error) {
                    console.error(
                        `[reqlan] Skipping document that failed to load during workspace init: ${uri.toString()}`,
                        error
                    );
                }
            })
        );
    }
}

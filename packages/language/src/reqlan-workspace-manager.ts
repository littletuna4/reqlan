import {
    DefaultWorkspaceManager,
    type LangiumDocument,
    type LangiumSharedCoreServices,
    type Stream,
    type URI
} from 'langium';
import type { RqConfig } from './reqlan-path-resolve.js';

/**
 * Loads workspace documents independently so one catastrophic parse failure
 * (for example Chevrotain recovery stack overflow) cannot abort LSP workspace init.
 * rq:["../../../reqlan rq/language/syntax.rq".no_name_idea_safe_warning]
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 */
export class ReqlanWorkspaceManager extends DefaultWorkspaceManager {
    /**
     * Per-directory cache for resolved `.reqlan/config.json` results.
     * Keyed by directory URI string. `undefined` values mean the directory tree has no `.reqlan/` base.
     * Cleared on workspace reinitialisation so config changes take effect on the next reload.
     */
    readonly rqConfigCache: Map<string, RqConfig | undefined> = new Map();

    constructor(services: LangiumSharedCoreServices) {
        super(services);
    }

    protected override async loadWorkspaceDocuments(
        uris: Stream<URI>,
        collector: (document: LangiumDocument) => void
    ): Promise<void> {
        this.rqConfigCache.clear();
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

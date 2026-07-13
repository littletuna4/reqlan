/**
 * Grammar configuration for rename and comment handling in requirement documents.
 */
import type { GrammarConfig, LangiumCoreServices } from 'langium';
import { createGrammarConfig } from 'langium';

const ReqlanNameRegexp = /"[^"]*"|'[^']*'|\w[\w_]*/;

export function createReqlanGrammarConfig(services: LangiumCoreServices): GrammarConfig {
    return {
        ...createGrammarConfig(services),
        nameRegexp: ReqlanNameRegexp
    };
}

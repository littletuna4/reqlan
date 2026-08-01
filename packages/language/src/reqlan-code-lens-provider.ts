/**
 * CodeLens buttons classifying references (idea, reqlan/other file, folder).
 */
import type { LangiumDocument } from 'langium';
import { AstUtils } from 'langium';
import type { CodeLensProvider } from 'langium/lsp';
import type { CancellationToken } from 'vscode-languageserver';
import type { CodeLens, CodeLensParams } from 'vscode-languageserver';
import {
    REQLAN_REFERENCE_CODE_LENS_SETTING,
    referenceCodeLensEnabled,
    type ReferenceCodeLensSettings
} from './reqlan-code-lens-settings.js';
import {
    buildReferenceCodeLens,
    classifyReferenceForCodeLens
} from './reqlan-reference-code-lens.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanCodeLensProvider implements CodeLensProvider {

    private readonly services: ReqlanServices;

    constructor(services: ReqlanServices) {
        this.services = services;
    }

    async provideCodeLens(
        document: LangiumDocument,
        _params: CodeLensParams,
        _cancelToken?: CancellationToken
    ): Promise<CodeLens[] | undefined> {
        const settings = await this.services.shared.workspace.ConfigurationProvider.getConfiguration(
            'reqlan',
            REQLAN_REFERENCE_CODE_LENS_SETTING
        ) as ReferenceCodeLensSettings | undefined;
        if (!referenceCodeLensEnabled(settings)) {
            return [];
        }

        const lenses: CodeLens[] = [];
        for (const node of AstUtils.streamAst(document.parseResult.value)) {
            const classification = classifyReferenceForCodeLens(this.services, node);
            if (!classification) {
                continue;
            }
            const lens = buildReferenceCodeLens(this.services, node, classification);
            if (lens) {
                lenses.push(lens);
            }
        }
        return lenses;
    }
}

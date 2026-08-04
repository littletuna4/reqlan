import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { createChatRequestHandler } from './chat-request-handler.js';
import { FileReferenceTool, RequirementReferenceTool } from './chat-reference-tools.js';

const PARTICIPANT_ID = 'reqlan.reqlan-extension';

export function registerChatParticipantModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const makeContext = () => {
        const active = submodule.index.getActiveBase();
        return {
            store: submodule.index.indexStore,
            analytical: submodule.index.store,
            workspaceRoot: active?.descriptor.root
        };
    };

    // The chat API is not present on every host (or may be a proposed API).
    // Guard so a missing API degrades gracefully instead of throwing during
    // activation.
    if (typeof vscode.chat?.createChatParticipant !== 'function') {
        registerReferenceTools(context, submodule, makeContext);
        return;
    }

    const handler = createChatRequestHandler({
        index: submodule.index,
        analysers: submodule.analysers,
        makeContext
    });

    const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'logo.png');
    participant.followupProvider = {
        provideFollowups(result) {
            const command = result.metadata?.command;
            if (command === 'rq-search' || command === 'default') {
                return [{
                    prompt: '/rq-context',
                    label: 'Show context for the active file'
                }, {
                    prompt: '/rq-graph',
                    label: 'Show the local requirement graph'
                }];
            }
            if (command === 'rq-context') {
                return [{
                    prompt: '/rq-graph',
                    label: 'Expand to the local graph'
                }];
            }
            return [{
                prompt: '/rq-search ',
                label: 'Search requirements by keyword'
            }];
        }
    };

    context.subscriptions.push(participant);
    registerReferenceTools(context, submodule, makeContext);
}

function registerReferenceTools(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule,
    makeContext: () => {
        store: AnalyticalSubmodule['index']['indexStore'];
        analytical: AnalyticalSubmodule['store'];
        workspaceRoot?: string;
    }
): void {
    // `vscode.lm` itself may be undefined on hosts without the language-model
    // tools API; use optional access so this never throws during activation.
    if (typeof vscode.lm?.registerTool !== 'function') {
        return;
    }

    context.subscriptions.push(
        vscode.lm.registerTool(
            'reqlan_requirement_reference',
            new RequirementReferenceTool(submodule.index, submodule.analysers, makeContext)
        ),
        vscode.lm.registerTool(
            'reqlan_file_reference',
            new FileReferenceTool(submodule.index, submodule.analysers, makeContext)
        )
    );
}

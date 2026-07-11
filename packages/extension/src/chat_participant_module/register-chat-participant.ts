import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { createChatRequestHandler } from './chat-request-handler.js';
import { FileReferenceTool, RequirementReferenceTool } from './chat-reference-tools.js';

const PARTICIPANT_ID = 'reqlan.reqlan';

export function registerChatParticipantModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const makeContext = () => ({
        store: submodule.index.indexStore,
        analytical: submodule.store,
        workspaceRoot
    });

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
    if (!('registerTool' in vscode.lm) || typeof vscode.lm.registerTool !== 'function') {
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

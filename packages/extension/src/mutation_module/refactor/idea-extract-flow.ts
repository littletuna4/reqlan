/**
 * Shared idea extract/move flow for command palette and code actions.
 * Move commands live here; [decompose] must reuse the same resolve → destination →
 * plan → apply → reindex sequence without overlapping the move behaviour.
 * Resolve-at-cursor uses napi symbolic extract.
 * Move and delete edit plans come from the native planner.
 * rq:["../../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
 * rq:["../../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]
 * rq:["../../../../../reqlan rq/extension/host/features-commands.rq".decompose]
 * rq:["../../../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
 */
import { analyzeLocalSymbolic, planIdeaDelete, planIdeaMove, type PlannerDocumentEdits, type PlannerFileText } from '@reqlan/analytical';
import type { IdeaRefactorCommandArgs } from '@reqlan/language';
import * as vscode from 'vscode';
import type { IndexService } from '../../analytical_submodule/index-store/index-service.js';
import { promptAndApplyFileMoveChanges } from '../show-mutation-approval.js';
import type { FileMoveChange } from '../file-move-plan.js';
import { resolveIndexFileUri, toIndexFileUri } from '../../analytical_submodule/index-store/resolve-index-file-uri.js';

export async function resolveIdeaRefactorArgs(
    args?: IdeaRefactorCommandArgs
): Promise<IdeaRefactorCommandArgs | undefined> {
    if (args?.documentUri && args.ideaName) {
        return args;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'reqlan' || !editor.document.uri.fsPath.endsWith('.rq')) {
        void vscode.window.showErrorMessage('Open a .rq file to move an idea.');
        return undefined;
    }

    const documentUri = editor.document.uri.toString();
    const text = editor.document.getText();
    let ideas: { name: string; lineStart: number }[] = [];
    try {
        const symbolic = analyzeLocalSymbolic(documentUri, text);
        ideas = symbolic.ideas
            .filter(idea => idea.kind !== 'ideaset')
            .map(idea => ({ name: idea.name, lineStart: idea.lineStart }));
    } catch (error) {
        console.error('[reqlan] native idea list for refactor failed:', error);
        void vscode.window.showErrorMessage('Could not read ideas in this file.');
        return undefined;
    }

    if (ideas.length === 0) {
        void vscode.window.showErrorMessage('This file has no idea to move.');
        return undefined;
    }

    const cursorLine = editor.selection.active.line;
    const atCursor = ideas.find(idea => idea.lineStart === cursorLine);
    if (atCursor) {
        return {
            documentUri,
            ideaName: atCursor.name,
            range: {
                start: { line: atCursor.lineStart, character: 0 },
                end: { line: atCursor.lineStart, character: 0 }
            }
        };
    }

    const picked = await vscode.window.showQuickPick(
        ideas.map(idea => ({
            label: idea.name,
            description: `line ${idea.lineStart + 1}`,
            idea
        })),
        { placeHolder: 'Select an idea to move' }
    );
    if (!picked?.idea.name) {
        return undefined;
    }
    return {
        documentUri,
        ideaName: picked.idea.name,
        range: {
            start: { line: picked.idea.lineStart, character: 0 },
            end: { line: picked.idea.lineStart, character: 0 }
        }
    };
}

export async function pickDestinationRqFile(
    sourceUri: string,
    openLabel: string
): Promise<vscode.Uri | undefined> {
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { 'Reqlan': ['rq'] },
        openLabel
    });
    const destVsUri = picked?.[0];
    if (!destVsUri) {
        return undefined;
    }
    if (destVsUri.toString() === sourceUri) {
        void vscode.window.showInformationMessage('Choose a different destination file.');
        return undefined;
    }
    return destVsUri;
}

export async function moveIdeaToFile(
    args: IdeaRefactorCommandArgs,
    index: IndexService,
    options: { leaveSourceStub: boolean; openLabel: string }
): Promise<void> {
    const destVsUri = await pickDestinationRqFile(args.documentUri, options.openLabel);
    if (!destVsUri) {
        return;
    }
    const sourceUri = vscode.Uri.parse(args.documentUri);
    if (destVsUri.toString() === sourceUri.toString()) {
        return;
    }
    const sourceText = await readDocumentText(sourceUri);
    const destText = await readDocumentText(destVsUri);
    if (!fileDeclaresIdea(sourceUri.toString(), sourceText, args.ideaName)) {
        void vscode.window.showErrorMessage(`Could not find idea '${args.ideaName}'.`);
        return;
    }
    if (fileDeclaresIdea(destVsUri.toString(), destText, args.ideaName)) {
        void vscode.window.showErrorMessage(`The destination file already has idea '${args.ideaName}'.`);
        return;
    }
    const files = await collectPlannerFiles(index, sourceUri, args.ideaName, new Set([
        sourceUri.toString(),
        destVsUri.toString()
    ]));
    let planned: PlannerDocumentEdits[];
    try {
        planned = planIdeaMove(
            sourceUri.toString(),
            sourceText,
            destVsUri.toString(),
            destText,
            args.ideaName,
            { leaveStub: options.leaveSourceStub, files }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not plan the move.';
        void vscode.window.showErrorMessage(message);
        return;
    }
    const changes = toFileMoveChanges(planned);
    if (changes.length === 0) {
        return;
    }
    await promptAndApplyFileMoveChanges(changes);
    await reindexUris(index, [sourceUri, destVsUri, ...planned.map(entry => vscode.Uri.parse(entry.uri))]);
}

export async function deleteIdea(
    args: IdeaRefactorCommandArgs,
    index: IndexService
): Promise<void> {
    const sourceUri = vscode.Uri.parse(args.documentUri);
    const sourceText = await readDocumentText(sourceUri);
    if (!fileDeclaresIdea(sourceUri.toString(), sourceText, args.ideaName)) {
        void vscode.window.showErrorMessage(`Could not find idea '${args.ideaName}'.`);
        return;
    }
    const files = await collectPlannerFiles(index, sourceUri, args.ideaName, new Set([sourceUri.toString()]));
    const planned = planIdeaDelete(sourceUri.toString(), sourceText, args.ideaName, files);
    const changes = toFileMoveChanges(planned);
    if (changes.length === 0) {
        return;
    }
    await promptAndApplyFileMoveChanges(changes);
    await reindexUris(index, [sourceUri, ...planned.map(entry => vscode.Uri.parse(entry.uri))]);
}

async function readDocumentText(uri: vscode.Uri): Promise<string> {
    const open = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
    if (open) {
        return open.getText();
    }
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
}

function fileDeclaresIdea(uri: string, text: string, ideaName: string): boolean {
    try {
        const symbolic = analyzeLocalSymbolic(uri, text);
        return symbolic.ideas.some(idea => idea.kind !== 'ideaset' && idea.name === ideaName);
    } catch (error) {
        console.error('[reqlan] native idea lookup for refactor failed:', error);
        return false;
    }
}

async function collectPlannerFiles(
    index: IndexService,
    sourceUri: vscode.Uri,
    ideaName: string,
    skip: ReadonlySet<string>
): Promise<PlannerFileText[]> {
    const texts = new Map<string, string>();
    const add = async (uri: vscode.Uri, text?: string) => {
        const key = uri.toString();
        if (skip.has(key) || texts.has(key)) {
            return;
        }
        try {
            texts.set(key, text ?? await readDocumentText(uri));
        } catch {
            // ignore missing docs
        }
    };
    for (const document of vscode.workspace.textDocuments) {
        if (document.uri.scheme !== 'file' || skip.has(document.uri.toString())) {
            continue;
        }
        if (document.getText().includes('rq:[') || document.uri.fsPath.endsWith('.rq')) {
            texts.set(document.uri.toString(), document.getText());
        }
    }
    try {
        const store = index.indexStore;
        const indexed = toIndexFileUri(sourceUri);
        for (const idea of await store.getIdeasInFile(indexed)) {
            if (idea.name !== ideaName) {
                continue;
            }
            for (const edge of await store.getEdgesFrom(idea.id)) {
                if (edge.kind === 'comment_link' && edge.targetFile) {
                    await add(resolveIndexFileUri(edge.targetFile));
                }
            }
            for (const edge of await store.getEdgesTo(idea.id)) {
                if (edge.kind !== 'references') {
                    continue;
                }
                const source = await store.getIdea(edge.sourceId);
                if (source?.fileUri) {
                    await add(resolveIndexFileUri(source.fileUri));
                }
            }
        }
    } catch {
        // no active base / index
    }
    return [...texts].map(([uri, text]) => ({ uri, text }));
}

function toFileMoveChanges(planned: PlannerDocumentEdits[]): FileMoveChange[] {
    return planned.map(entry => ({
        uri: vscode.Uri.parse(entry.uri),
        oldUri: vscode.Uri.parse(entry.uri),
        edits: entry.edits
    }));
}

async function reindexUris(index: IndexService, uris: vscode.Uri[]): Promise<void> {
    const seen = new Set<string>();
    for (const uri of uris) {
        const key = uri.toString();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        await index.indexFile(uri);
    }
}

/**
 * Shared idea extract/move flow for command palette and code actions.
 * Move commands live here; [decompose] must reuse the same resolve → destination →
 * plan → apply → reindex sequence without overlapping the move behaviour.
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".decompose]
 */
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import {
    createReqlanServices,
    findIdeaDeclarationAtRange,
    isRefactorIdeaDeclaration,
    listRefactorIdeaDeclarations,
    planIdeaDeleteEdits,
    planIdeaMoveEdits,
    type IdeaRefactorCommandArgs,
    type Model
} from '@reqlan/language';
import type { LangiumDocument } from 'langium';
import { AstUtils } from 'langium';
import * as vscode from 'vscode';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { promptAndApplyFileMoveChanges } from '../mutation_hooks_module/show-mutation-approval.js';
import type { FileMoveChange } from '../mutation_hooks_module/file-move-plan.js';
import { resolveIndexFileUri, toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

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

    const services = createReqlanServices(NodeFileSystem);
    const document = await loadRqDocument(services, URI.parse(editor.document.uri.toString()));
    const atCursor = findIdeaDeclarationAtRange(document, {
        start: { line: editor.selection.active.line, character: editor.selection.active.character },
        end: { line: editor.selection.active.line, character: editor.selection.active.character }
    });
    if (atCursor?.name) {
        return {
            documentUri: editor.document.uri.toString(),
            ideaName: atCursor.name,
            range: atCursor.$cstNode?.range ?? {
                start: { line: editor.selection.active.line, character: 0 },
                end: { line: editor.selection.active.line, character: 0 }
            }
        };
    }

    const ideas = listRefactorIdeaDeclarations(document).filter(idea => idea.name);
    if (ideas.length === 0) {
        void vscode.window.showErrorMessage('This file has no idea to move.');
        return undefined;
    }
    const picked = await vscode.window.showQuickPick(
        ideas.map(idea => ({
            label: idea.name,
            description: idea.$cstNode ? `line ${idea.$cstNode.range.start.line + 1}` : undefined,
            idea
        })),
        { placeHolder: 'Select an idea to move' }
    );
    if (!picked?.idea.name) {
        return undefined;
    }
    return {
        documentUri: editor.document.uri.toString(),
        ideaName: picked.idea.name,
        range: picked.idea.$cstNode?.range ?? {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
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

    const services = createReqlanServices(NodeFileSystem);
    const sourceUri = URI.parse(args.documentUri);
    const destUri = URI.parse(destVsUri.toString());
    const sourceDoc = await loadRqDocument(services, sourceUri);
    const destDoc = await loadRqDocument(services, destUri);
    const idea = findIdeaByName(sourceDoc, args.ideaName);
    if (!idea) {
        void vscode.window.showErrorMessage(`Could not find idea '${args.ideaName}'.`);
        return;
    }
    if (listRefactorIdeaDeclarations(destDoc).some(entry => entry.name === args.ideaName)) {
        void vscode.window.showErrorMessage(`The destination file already has idea '${args.ideaName}'.`);
        return;
    }

    const references = services.Reqlan.references.References
        .findReferences(idea, { includeDeclaration: true })
        .toArray();
    const documentsText = await collectWorkspaceTextsForRefs(references, sourceDoc, destDoc, index, args.ideaName);
    const planned = planIdeaMoveEdits({
        idea,
        sourceDocument: sourceDoc,
        destinationDocument: destDoc,
        references,
        documentsText,
        leaveSourceStub: options.leaveSourceStub
    });
    const changes = toFileMoveChanges(planned);
    if (changes.length === 0) {
        return;
    }
    await promptAndApplyFileMoveChanges(changes);
    await reindexUris(index, [sourceUri, destUri, ...planned.map(entry => URI.parse(entry.uri))]);
}

export async function deleteIdea(
    args: IdeaRefactorCommandArgs,
    index: IndexService
): Promise<void> {
    const services = createReqlanServices(NodeFileSystem);
    const sourceUri = URI.parse(args.documentUri);
    const sourceDoc = await loadRqDocument(services, sourceUri);
    const idea = findIdeaByName(sourceDoc, args.ideaName);
    if (!idea) {
        void vscode.window.showErrorMessage(`Could not find idea '${args.ideaName}'.`);
        return;
    }

    const references = services.Reqlan.references.References
        .findReferences(idea, { includeDeclaration: true })
        .toArray();
    const documentsText = await collectWorkspaceTextsForRefs(references, sourceDoc, undefined, index, args.ideaName);
    const planned = planIdeaDeleteEdits(idea, references, documentsText);
    const changes = toFileMoveChanges(planned);
    if (changes.length === 0) {
        return;
    }
    await promptAndApplyFileMoveChanges(changes);
    await reindexUris(index, [sourceUri, ...planned.map(entry => URI.parse(entry.uri))]);
}

export async function loadRqDocument(
    services: ReturnType<typeof createReqlanServices>,
    uri: URI
): Promise<LangiumDocument<Model>> {
    const vsUri = vscode.Uri.parse(uri.toString());
    const text = Buffer.from(await vscode.workspace.fs.readFile(vsUri)).toString('utf8');
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
        text,
        uri
    ) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(document);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
    return document;
}

function findIdeaByName(document: LangiumDocument<Model>, name: string) {
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
        if (isRefactorIdeaDeclaration(node) && node.name === name) {
            return node;
        }
    }
    return undefined;
}

async function collectWorkspaceTextsForRefs(
    references: { sourceUri: URI }[],
    sourceDoc: LangiumDocument,
    destDoc?: LangiumDocument,
    index?: IndexService,
    ideaName?: string
): Promise<Map<string, string>> {
    const texts = new Map<string, string>();
    texts.set(sourceDoc.uri.toString(), sourceDoc.textDocument.getText());
    if (destDoc) {
        texts.set(destDoc.uri.toString(), destDoc.textDocument.getText());
    }
    for (const reference of references) {
        const uri = reference.sourceUri.toString();
        if (texts.has(uri)) {
            continue;
        }
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
            texts.set(uri, doc.getText());
        } catch {
            // ignore missing docs
        }
    }
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.uri.scheme !== 'file' || texts.has(doc.uri.toString())) {
            continue;
        }
        if (doc.getText().includes('rq:[')) {
            texts.set(doc.uri.toString(), doc.getText());
        }
    }
    if (index && ideaName) {
        await addCommentLinkedFileTexts(texts, index, sourceDoc.uri, ideaName);
    }
    return texts;
}

async function addCommentLinkedFileTexts(
    texts: Map<string, string>,
    index: IndexService,
    sourceUri: URI,
    ideaName: string
): Promise<void> {
    try {
        const store = index.indexStore;
        const indexed = toIndexFileUri(vscode.Uri.parse(sourceUri.toString()));
        for (const idea of await store.getIdeasInFile(indexed)) {
            if (idea.name !== ideaName) {
                continue;
            }
            for (const edge of await store.getEdgesFrom(idea.id)) {
                if (edge.kind !== 'comment_link' || !edge.targetFile) {
                    continue;
                }
                const vsUri = resolveIndexFileUri(edge.targetFile);
                const key = vsUri.toString();
                if (texts.has(key)) {
                    continue;
                }
                try {
                    const doc = await vscode.workspace.openTextDocument(vsUri);
                    texts.set(key, doc.getText());
                } catch {
                    // ignore missing docs
                }
            }
        }
    } catch {
        // no active base / index
    }
}

function toFileMoveChanges(
    planned: Array<{ uri: string; edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> }>
): FileMoveChange[] {
    return planned.map(entry => ({
        uri: vscode.Uri.parse(entry.uri),
        oldUri: vscode.Uri.parse(entry.uri),
        edits: entry.edits
    }));
}

async function reindexUris(index: IndexService, uris: URI[]): Promise<void> {
    const seen = new Set<string>();
    for (const uri of uris) {
        const key = uri.toString();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        await index.indexFile(vscode.Uri.parse(uri.toString()));
    }
}

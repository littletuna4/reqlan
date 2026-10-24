/**
 * Quick Fixes that create every unresolved local idea in the current file.
 * rq:["../../../reqlan rq/extension/host/features-commands.rq".create_all_unresolved_ideas]
 */
import { DocumentValidator, type LangiumDocument } from 'langium';
import type { CodeAction, Diagnostic, TextEdit } from 'vscode-languageserver';
import { CodeActionKind } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export const CREATE_ALL_UNRESOLVED_IDEAS_IN_FILE_TITLE = 'Create all unresolved ideas in this file';
export const CREATE_ALL_UNRESOLVED_IDEAS_IN_NEW_FILE_TITLE = 'Create all unresolved ideas in a new file…';

const CREATE_FILE_COMMAND = 'reqlan.importError.createFile';
const IDEA_NAME = /^[_A-Za-z][\w-]*$/;

interface LinkingDiagnosticData {
    code?: string;
    containerType?: string;
    property?: string;
    refText?: string;
}

interface UnresolvedLocalIdea {
    name: string;
    diagnostics: Diagnostic[];
}

export interface CreateIdeasFileArgs {
    refText?: string;
    refTexts?: readonly string[];
}

/** Idea names from a create-file command. Invalid names are dropped. Order is kept. */
export function ideaNamesFromCreateArgs(args: CreateIdeasFileArgs): string[] {
    const source = args.refTexts && args.refTexts.length > 0
        ? args.refTexts
        : args.refText
            ? [args.refText]
            : [];
    const names: string[] = [];
    for (const name of source) {
        if (!IDEA_NAME.test(name) || names.includes(name)) {
            continue;
        }
        names.push(name);
    }
    return names;
}

export function defaultNewIdeaFileName(names: readonly string[]): string {
    const only = names.length === 1 ? names[0] : undefined;
    return only ? `${only}.rq` : 'unresolved.rq';
}

/** Idea blocks for a new file. No leading blank line. */
export function newFileIdeaText(names: readonly string[], eol = '\n'): string {
    const stubs = names.map(name => `${name} {${eol}    ${eol}}`);
    return `${stubs.join(`${eol}${eol}`)}${eol}`;
}

export function fromImportStatement(importPath: string, names: readonly string[]): string {
    return `from "${importPath}" import ${names.join(', ')}`;
}

/**
 * One Quick Fix appends every unresolved local idea at the end of this file.
 * One Quick Fix creates those ideas in a new file and imports them.
 */
export function createUnresolvedIdeasCodeActions(document: LangiumDocument): CodeAction[] {
    const unresolved = unresolvedLocalIdeas(document);
    if (unresolved.length === 0) {
        return [];
    }
    const names = unresolved.map(item => item.name);
    const firstName = names[0];
    if (!firstName) {
        return [];
    }
    const diagnostics = unresolved.flatMap(item => item.diagnostics);
    const uri = document.textDocument.uri;
    const actions: CodeAction[] = [];
    const edit = appendIdeasEdit(document.textDocument, names);
    if (edit) {
        actions.push({
            title: CREATE_ALL_UNRESOLVED_IDEAS_IN_FILE_TITLE,
            kind: CodeActionKind.QuickFix,
            diagnostics,
            edit: { changes: { [uri]: [edit] } }
        });
    }
    const first = diagnostics[0];
    actions.push({
        title: CREATE_ALL_UNRESOLVED_IDEAS_IN_NEW_FILE_TITLE,
        kind: CodeActionKind.QuickFix,
        diagnostics,
        command: {
            title: CREATE_ALL_UNRESOLVED_IDEAS_IN_NEW_FILE_TITLE,
            command: CREATE_FILE_COMMAND,
            arguments: [{
                documentUri: uri,
                refText: firstName,
                refTexts: names,
                range: first?.range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
            }]
        }
    });
    return actions;
}

export function appendIdeasEdit(textDocument: TextDocument, names: readonly string[]): TextEdit | undefined {
    if (names.length === 0) {
        return undefined;
    }
    const text = textDocument.getText();
    const end = textDocument.positionAt(text.length);
    return {
        range: { start: end, end },
        newText: appendIdeaStubs(text, names)
    };
}

export function appendIdeaStubs(text: string, names: readonly string[]): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const stubs = names.map(name => `${name} {${eol}    ${eol}}`).join(`${eol}${eol}`);
    if (text.length === 0) {
        return `${stubs}${eol}`;
    }
    const separator = text.endsWith('\n') ? eol : `${eol}${eol}`;
    return `${separator}${stubs}${eol}`;
}

function unresolvedLocalIdeas(document: LangiumDocument): UnresolvedLocalIdea[] {
    const byName = new Map<string, UnresolvedLocalIdea>();
    for (const diagnostic of document.diagnostics ?? []) {
        const name = unresolvedLocalIdeaName(diagnostic);
        if (!name) {
            continue;
        }
        const existing = byName.get(name);
        if (existing) {
            existing.diagnostics.push(diagnostic);
            continue;
        }
        byName.set(name, { name, diagnostics: [diagnostic] });
    }
    return [...byName.values()];
}

function unresolvedLocalIdeaName(diagnostic: Diagnostic): string | undefined {
    const data = diagnostic.data as LinkingDiagnosticData | undefined;
    if (data?.code !== DocumentValidator.LinkingError || !data.refText) {
        return undefined;
    }
    if (data.property !== 'idea' || data.containerType !== 'LocalReference') {
        return undefined;
    }
    if (!IDEA_NAME.test(data.refText)) {
        return undefined;
    }
    return data.refText;
}

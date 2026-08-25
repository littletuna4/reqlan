/**
 * Quick Fix that creates a missing idea below the idea that contains the unresolved reference.
 * rq:["../../../reqlan rq/extension/features-commands.rq".create_idea_below_idea_containing_unresolved_reference_under_cursor]
 */
import { AstUtils, DocumentValidator, type LangiumDocument } from 'langium';
import type { CodeAction, Diagnostic, Position, Range, TextEdit } from 'vscode-languageserver';
import { CodeActionKind } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { isRefactorIdeaDeclaration, type RefactorIdeaDeclaration } from './reqlan-idea-refactor.js';

export const CREATE_ALL_UNRESOLVED_IDEAS_BELOW_TITLE = 'Create all unresolved ideas below';

const UNQUOTED_IDEA_NAME = /^[_A-Za-z][\w-]*$/;

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

export function createIdeaBelowTitle(name: string): string {
    return `Create '${name}' below`;
}

/**
 * Offer create-below Quick Fixes for unresolved local idea references in the
 * idea that contains the caret. One name applies directly; several names offer
 * each name and an all-names action.
 */
export function createIdeaBelowCodeActions(
    document: LangiumDocument,
    range: Range
): CodeAction[] {
    const context = unresolvedLocalIdeasInCaretIdea(document, range);
    if (!context) {
        return [];
    }
    const { idea, unresolved } = context;
    const uri = document.textDocument.uri;
    if (unresolved.length === 1) {
        const item = unresolved[0]!;
        const edit = buildCreateIdeasBelowEdit(document, idea, [item.name]);
        if (!edit) {
            return [];
        }
        return [workspaceAction(createIdeaBelowTitle(item.name), uri, edit, item.diagnostics)];
    }

    const actions: CodeAction[] = [];
    const allEdit = buildCreateIdeasBelowEdit(document, idea, unresolved.map(item => item.name));
    if (allEdit) {
        actions.push(workspaceAction(
            CREATE_ALL_UNRESOLVED_IDEAS_BELOW_TITLE,
            uri,
            allEdit,
            unresolved.flatMap(item => item.diagnostics)
        ));
    }
    for (const item of unresolved) {
        const edit = buildCreateIdeasBelowEdit(document, idea, [item.name]);
        if (!edit) {
            continue;
        }
        actions.push(workspaceAction(createIdeaBelowTitle(item.name), uri, edit, item.diagnostics));
    }
    return actions;
}

export function buildCreateIdeasBelowEdit(
    document: LangiumDocument,
    idea: RefactorIdeaDeclaration,
    names: readonly string[]
): TextEdit | undefined {
    if (!idea.$cstNode || names.length === 0) {
        return undefined;
    }
    const insertAt = idea.$cstNode.range.end;
    const eol = documentEol(document.textDocument);
    return {
        range: { start: insertAt, end: insertAt },
        newText: formatIdeaStubs(names, eol)
    };
}

export function findContainingIdeaAtRange(
    document: LangiumDocument,
    range: Range
): RefactorIdeaDeclaration | undefined {
    const offset = document.textDocument.offsetAt(range.start);
    let best: RefactorIdeaDeclaration | undefined;
    let bestSize = Number.POSITIVE_INFINITY;
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
        if (!isRefactorIdeaDeclaration(node) || !node.$cstNode) {
            continue;
        }
        const start = document.textDocument.offsetAt(node.$cstNode.range.start);
        const end = document.textDocument.offsetAt(node.$cstNode.range.end);
        if (offset < start || offset > end) {
            continue;
        }
        const size = end - start;
        if (size < bestSize) {
            best = node;
            bestSize = size;
        }
    }
    return best;
}

function unresolvedLocalIdeasInCaretIdea(
    document: LangiumDocument,
    range: Range
): { idea: RefactorIdeaDeclaration; unresolved: UnresolvedLocalIdea[] } | undefined {
    const idea = findContainingIdeaAtRange(document, range);
    if (!idea?.$cstNode) {
        return undefined;
    }
    const ideaRange = idea.$cstNode.range;
    const byName = new Map<string, UnresolvedLocalIdea>();
    for (const diagnostic of document.diagnostics ?? []) {
        const name = unresolvedLocalIdeaName(diagnostic, ideaRange);
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
    const unresolved = [...byName.values()];
    if (unresolved.length === 0) {
        return undefined;
    }
    return { idea, unresolved };
}

function unresolvedLocalIdeaName(diagnostic: Diagnostic, ideaRange: Range): string | undefined {
    const data = diagnostic.data as LinkingDiagnosticData | undefined;
    if (data?.code !== DocumentValidator.LinkingError || !data.refText) {
        return undefined;
    }
    if (data.property !== 'idea' || data.containerType !== 'LocalReference') {
        return undefined;
    }
    if (!rangeContained(diagnostic.range, ideaRange)) {
        return undefined;
    }
    return data.refText;
}

function formatIdeaStubs(names: readonly string[], eol: string): string {
    const stubs = names.map(name => `${formatIdeaName(name)} {${eol}    ${eol}}`);
    return `${eol}${eol}${stubs.join(`${eol}${eol}`)}${eol}`;
}

function formatIdeaName(name: string): string {
    return UNQUOTED_IDEA_NAME.test(name) ? name : JSON.stringify(name);
}

function documentEol(textDocument: TextDocument): '\n' | '\r\n' {
    return textDocument.getText().includes('\r\n') ? '\r\n' : '\n';
}

function rangeContained(inner: Range, outer: Range): boolean {
    return comparePosition(inner.start, outer.start) >= 0 && comparePosition(inner.end, outer.end) <= 0;
}

function comparePosition(left: Position, right: Position): number {
    if (left.line !== right.line) {
        return left.line - right.line;
    }
    return left.character - right.character;
}

function workspaceAction(
    title: string,
    uri: string,
    edit: TextEdit,
    diagnostics: Diagnostic[]
): CodeAction {
    return {
        title,
        kind: CodeActionKind.QuickFix,
        diagnostics,
        edit: {
            changes: {
                [uri]: [edit]
            }
        }
    };
}

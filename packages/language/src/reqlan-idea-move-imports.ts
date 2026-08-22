/**
 * Import rewrites for moving an idea between `.rq` files: drop unused source
 * imports and copy required imports onto the destination.
 * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_symbol_move]
 */
import { AstUtils, type AstNode, type LangiumDocument } from 'langium';
import type { Position, Range, TextEdit } from 'vscode-languageserver';
import {
    isFromImport,
    isIdeaSet,
    isLocalReference,
    isModel,
    isNamespaceImport,
    isQualifiedImport,
    isQualifiedReference,
    type FromImport,
    type FromImportSpecifier,
    type Idea,
    type Import,
    type Model,
    type OneLinerIdea
} from './generated/ast.js';
import {
    findExistingFromImport,
    findImportInsertPosition,
    hasNamespaceImport,
    relativeRqImportPath
} from './reqlan-import-edits.js';
import {
    importBindings,
    specifierBindingName
} from './reqlan-import-bindings.js';
import { resolveDocumentPathUri } from './reqlan-path-resolve.js';
import { unquoteReqlanString } from './reqlan-quoted-strings.js';

export interface DestFromSpecifierNeed {
    ideaName: string;
    alias?: string;
}

export function collectUsedBindingNames(root: AstNode, skip?: AstNode): Set<string> {
    const names = new Set<string>();
    for (const node of AstUtils.streamAst(root)) {
        if (skip && isAstInside(node, skip)) {
            continue;
        }
        if (isLocalReference(node)) {
            const name = node.idea.$refText;
            if (name) {
                names.add(name);
            }
        }
        if (isQualifiedReference(node)) {
            const qualifier = node.qualifier?.$refText;
            if (qualifier) {
                names.add(qualifier);
            }
        }
        if (isIdeaSet(node)) {
            for (const member of node.members) {
                if (member.$refText) {
                    names.add(member.$refText);
                }
            }
        }
    }
    return names;
}

export function topLevelDeclaredNames(model: Model): Set<string> {
    const names = new Set<string>();
    for (const element of model.elements) {
        if ('name' in element && typeof element.name === 'string' && element.name.length > 0) {
            names.add(element.name);
        }
    }
    return names;
}

export function sourceBoundNames(model: Model): Set<string> {
    const names = topLevelDeclaredNames(model);
    for (const importDecl of model.imports) {
        for (const binding of importBindings(importDecl)) {
            names.add(binding.name);
        }
    }
    return names;
}

export function planUnusedImportEdits(
    document: LangiumDocument,
    usedNames: Set<string>
): TextEdit[] {
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return [];
    }
    const edits: TextEdit[] = [];
    for (const importDecl of model.imports) {
        edits.push(...planUnusedEditsForImport(document, importDecl, usedNames));
    }
    return edits;
}

export function planDestRequiredImportEdits(input: {
    idea: Idea | OneLinerIdea;
    sourceDocument: LangiumDocument;
    destinationDocument: LangiumDocument;
}): TextEdit[] {
    const sourceModel = input.sourceDocument.parseResult.value;
    const destModel = input.destinationDocument.parseResult.value;
    if (!isModel(sourceModel) || !isModel(destModel)) {
        return [];
    }

    const usedInIdea = collectUsedBindingNames(input.idea);
    usedInIdea.delete(input.idea.name);
    const destLocals = topLevelDeclaredNames(destModel);
    const sourceSiblings = topLevelDeclaredNames(sourceModel);
    sourceSiblings.delete(input.idea.name);

    const fromNeeds = new Map<string, DestFromSpecifierNeed[]>();
    const nsNeeds = new Map<string, string>();

    const pushFrom = (path: string, specifier: DestFromSpecifierNeed) => {
        const list = fromNeeds.get(path) ?? [];
        if (list.some(entry => entry.ideaName === specifier.ideaName && entry.alias === specifier.alias)) {
            fromNeeds.set(path, list);
            return;
        }
        list.push(specifier);
        fromNeeds.set(path, list);
    };

    for (const name of usedInIdea) {
        if (destLocals.has(name)) {
            continue;
        }
        if (sourceSiblings.has(name)) {
            const path = relativeRqImportPath(input.destinationDocument.uri, input.sourceDocument.uri);
            pushFrom(path, { ideaName: name });
            continue;
        }
        const binding = findImportBinding(sourceModel, name);
        if (!binding) {
            continue;
        }
        const rewritten = rewriteImportPathForDocument(
            binding.path,
            input.sourceDocument,
            input.destinationDocument
        );
        if (!rewritten) {
            continue;
        }
        if (binding.kind === 'namespace') {
            nsNeeds.set(rewritten, binding.alias ?? name);
            continue;
        }
        pushFrom(rewritten, {
            ideaName: binding.ideaName ?? name,
            alias: binding.alias
        });
    }

    return buildDestImportEdits(input.destinationDocument, destModel, fromNeeds, nsNeeds);
}

export function uniqueImportAlias(base: string, taken: ReadonlySet<string>): string {
    const cleaned = base.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^(\d)/, '_$1') || 'imported';
    if (!taken.has(cleaned)) {
        return cleaned;
    }
    let suffix = 2;
    while (taken.has(`${cleaned}_${suffix}`)) {
        suffix += 1;
    }
    return `${cleaned}_${suffix}`;
}

export function rewriteImportPathForDocument(
    quotedOrRawPath: string,
    fromDocument: LangiumDocument,
    toDocument: LangiumDocument
): string | undefined {
    const path = unquoteReqlanString(quotedOrRawPath);
    if (path.startsWith('@/')) {
        return path;
    }
    const target = resolveDocumentPathUri(path, fromDocument, { config: null });
    if (target.toString() === toDocument.uri.toString()) {
        return undefined;
    }
    return relativeRqImportPath(toDocument.uri, target);
}

export function positionsEqual(left: Position, right: Position): boolean {
    return left.line === right.line && left.character === right.character;
}

function planUnusedEditsForImport(
    document: LangiumDocument,
    importDecl: Import,
    usedNames: Set<string>
): TextEdit[] {
    if (isFromImport(importDecl)) {
        const unused = importDecl.specifiers.filter(specifier => {
            const binding = specifierBindingName(specifier);
            return !binding || !usedNames.has(binding);
        });
        if (unused.length === 0) {
            return [];
        }
        if (unused.length === importDecl.specifiers.length) {
            const range = expandLineRange(importDecl.$cstNode?.range);
            return range ? [{ range, newText: '' }] : [];
        }
        return unused.flatMap(specifier => {
            const edit = planSpecifierRemoval(document, specifier);
            return edit ? [edit] : [];
        });
    }
    const bindings = importBindings(importDecl);
    const stillUsed = bindings.some(binding => usedNames.has(binding.name));
    if (stillUsed) {
        return [];
    }
    if (isNamespaceImport(importDecl) || isQualifiedImport(importDecl)) {
        const range = expandLineRange(importDecl.$cstNode?.range);
        return range ? [{ range, newText: '' }] : [];
    }
    return [];
}

function planSpecifierRemoval(
    document: LangiumDocument,
    specifier: FromImportSpecifier
): TextEdit | undefined {
    const node = specifier.$cstNode;
    if (!node) {
        return undefined;
    }
    const text = document.textDocument.getText();
    const start = document.textDocument.offsetAt(node.range.start);
    const end = document.textDocument.offsetAt(node.range.end);
    let rangeStart = start;
    let rangeEnd = end;
    const commaAfter = text.slice(end).match(/^,\s*/);
    if (commaAfter) {
        rangeEnd = end + commaAfter[0].length;
    } else {
        const commaBefore = text.slice(0, start).match(/,\s*$/);
        if (commaBefore) {
            rangeStart = start - commaBefore[0].length;
        }
    }
    return {
        range: {
            start: document.textDocument.positionAt(rangeStart),
            end: document.textDocument.positionAt(rangeEnd)
        },
        newText: ''
    };
}

function buildDestImportEdits(
    destDocument: LangiumDocument,
    destModel: Model,
    fromNeeds: Map<string, DestFromSpecifierNeed[]>,
    nsNeeds: Map<string, string>
): TextEdit[] {
    const edits: TextEdit[] = [];
    const newLines: string[] = [];

    for (const [path, alias] of nsNeeds) {
        if (hasNamespaceImport(destModel, path)) {
            continue;
        }
        newLines.push(`import "${path}" as ${alias}`);
    }

    for (const [path, specifiers] of fromNeeds) {
        const existing = findExistingFromImport(destModel, path);
        const toAdd = specifiers.filter(specifier => !fromImportHasSpecifier(existing, specifier));
        if (toAdd.length === 0) {
            continue;
        }
        if (existing && existing.specifiers.length > 0) {
            const last = existing.specifiers[existing.specifiers.length - 1];
            const insertAt = last?.$cstNode?.range.end;
            if (insertAt) {
                edits.push({
                    range: { start: insertAt, end: insertAt },
                    newText: `, ${toAdd.map(formatSpecifier).join(', ')}`
                });
                continue;
            }
        }
        newLines.push(`from "${path}" import ${toAdd.map(formatSpecifier).join(', ')}`);
    }

    if (newLines.length > 0) {
        const insert = findImportInsertPosition(destModel);
        const block = `${newLines.join('\n')}\n`;
        edits.push({
            range: { start: insert.position, end: insert.position },
            newText: insert.trailingNewline ? `${block}\n` : block
        });
    }
    return edits;
}

function fromImportHasSpecifier(
    existing: FromImport | undefined,
    specifier: DestFromSpecifierNeed
): boolean {
    if (!existing) {
        return false;
    }
    return existing.specifiers.some(entry => {
        const binding = specifierBindingName(entry);
        if (specifier.alias) {
            return entry.alias === specifier.alias;
        }
        return binding === specifier.ideaName || entry.idea.$refText === specifier.ideaName;
    });
}

function formatSpecifier(specifier: DestFromSpecifierNeed): string {
    return specifier.alias
        ? `${specifier.ideaName} as ${specifier.alias}`
        : specifier.ideaName;
}

interface ImportBindingMatch {
    kind: 'from' | 'namespace' | 'qualified';
    path: string;
    ideaName?: string;
    alias?: string;
}

function findImportBinding(model: Model, name: string): ImportBindingMatch | undefined {
    for (const importDecl of model.imports) {
        if (isFromImport(importDecl)) {
            const specifier = importDecl.specifiers.find(
                entry => specifierBindingName(entry) === name
            );
            if (specifier) {
                return {
                    kind: 'from',
                    path: importDecl.path,
                    ideaName: specifier.idea.$refText || name,
                    alias: specifier.alias
                };
            }
        }
        if (isNamespaceImport(importDecl) && importDecl.alias === name) {
            return {
                kind: 'namespace',
                path: importDecl.path,
                alias: importDecl.alias
            };
        }
        if (isQualifiedImport(importDecl)) {
            const binding = importDecl.alias ?? importDecl.idea.$refText;
            if (binding === name) {
                return {
                    kind: 'qualified',
                    path: importDecl.path,
                    ideaName: importDecl.idea.$refText || name,
                    alias: importDecl.alias
                };
            }
        }
    }
    return undefined;
}

function expandLineRange(range: Range | undefined): Range | undefined {
    if (!range) {
        return undefined;
    }
    return {
        start: { line: range.start.line, character: 0 },
        end: { line: range.end.line + 1, character: 0 }
    };
}

function isAstInside(node: AstNode, root: AstNode): boolean {
    let current: AstNode | undefined = node;
    while (current) {
        if (current === root) {
            return true;
        }
        current = current.$container;
    }
    return false;
}

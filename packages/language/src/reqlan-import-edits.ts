/**
 * Shared WorkspaceEdit helpers for import insertion used by unresolved-reference quick fixes
 * and cross-file reference completion auto-import.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_code_completion_auto_file_import]
 */
import type { LangiumDocument, URI } from 'langium';
import { UriUtils } from 'langium';
import type { Position, TextEdit } from 'vscode-languageserver';
import {
    isFromImport,
    isModel,
    isNamespaceImport,
    type FromImport,
    type Model
} from './generated/ast.js';
import { unquoteReqlanString } from './reqlan-references.js';

export function relativeRqImportPath(fromUri: URI, toUri: URI): string {
    const sourceDir = UriUtils.dirname(fromUri);
    let relativePath = UriUtils.relative(sourceDir, toUri);
    if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
        relativePath = `./${relativePath}`;
    }
    return relativePath;
}

export function findImportInsertPosition(model: Model): { position: Position; trailingNewline: boolean } {
    if (model.imports.length > 0) {
        const last = model.imports[model.imports.length - 1]!;
        const end = last.$cstNode?.range.end;
        if (end) {
            return {
                position: { line: end.line + 1, character: 0 },
                trailingNewline: false
            };
        }
    }
    const firstElement = model.elements[0];
    if (firstElement?.$cstNode) {
        return {
            position: firstElement.$cstNode.range.start,
            trailingNewline: true
        };
    }
    return { position: { line: 0, character: 0 }, trailingNewline: true };
}

export function findExistingFromImport(model: Model, importPath: string): FromImport | undefined {
    return model.imports.find((decl): decl is FromImport => {
        if (!isFromImport(decl)) {
            return false;
        }
        return unquoteReqlanString(decl.path) === importPath;
    });
}

export function hasNamespaceImport(model: Model, importPath: string): boolean {
    return model.imports.some(decl =>
        isNamespaceImport(decl) && unquoteReqlanString(decl.path) === importPath
    );
}

export function namespaceAliasForPath(model: Model, importPath: string): string | undefined {
    for (const decl of model.imports) {
        if (isNamespaceImport(decl) && unquoteReqlanString(decl.path) === importPath && decl.alias) {
            return decl.alias;
        }
    }
    return undefined;
}

export function buildFromImportEdit(
    document: LangiumDocument,
    importPath: string,
    symbolName: string
): TextEdit | undefined {
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return undefined;
    }
    const existing = findExistingFromImport(model, importPath);
    if (existing) {
        const alreadyImported = existing.specifiers.some(specifier => {
            const binding = specifier.alias ?? specifier.idea.$refText;
            return binding === symbolName || specifier.idea.$refText === symbolName;
        });
        if (alreadyImported) {
            return undefined;
        }
        const lastSpecifier = existing.specifiers[existing.specifiers.length - 1];
        const insertAt = lastSpecifier?.$cstNode?.range.end ?? existing.$cstNode?.range.end;
        if (!insertAt) {
            return undefined;
        }
        return {
            range: { start: insertAt, end: insertAt },
            newText: `, ${symbolName}`
        };
    }
    const insert = findImportInsertPosition(model);
    const line = `from "${importPath}" import ${symbolName}`;
    return {
        range: { start: insert.position, end: insert.position },
        newText: insert.trailingNewline ? `${line}\n\n` : `${line}\n`
    };
}

export function buildNamespaceImportEdit(
    document: LangiumDocument,
    importPath: string,
    alias: string
): TextEdit | undefined {
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return undefined;
    }
    if (hasNamespaceImport(model, importPath)) {
        return undefined;
    }
    const insert = findImportInsertPosition(model);
    const line = `import "${importPath}" as ${alias}`;
    return {
        range: { start: insert.position, end: insert.position },
        newText: insert.trailingNewline ? `${line}\n\n` : `${line}\n`
    };
}

export function fileBasenameAlias(fileUri: string | URI): string {
    const uriString = typeof fileUri === 'string' ? fileUri : fileUri.toString();
    const base = uriString.split('/').pop() ?? uriString;
    const withoutExt = base.replace(/\.rq$/i, '');
    const cleaned = withoutExt.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^(\d)/, '_$1');
    return cleaned || 'imported';
}

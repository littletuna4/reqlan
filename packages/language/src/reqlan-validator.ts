import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import { AstUtils } from 'langium';
import type { ReqlanAstType } from './generated/ast.js';
import {
    isFromImport,
    isIdea,
    isInvalidFromImport,
    isOneLinerIdea,
    type Model
} from './generated/ast.js';
import {
    collectFileLinks,
    fileLinkTargetIssueMessage
} from './reqlan-file-link-resolver.js';
import {
    importBindings,
    importPathOf,
    importedIdeaNames,
    isWellFormedFromImport
} from './reqlan-import-bindings.js';
import { isResolvableImportPath } from './reqlan-imports.js';
import type { ReqlanServices } from './reqlan-module.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';
import { unquoteReqlanString } from './reqlan-quoted-strings.js';

/**
 * Registers validation hooks for the requirement graph AST.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_does_not_exist_error]
 * rq:["../../../reqlan rq/language/imports.rq".import_error_recovery]
 */
export function registerValidationChecks(services: ReqlanServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ReqlanValidator;
    const checks: ValidationChecks<ReqlanAstType> = {
        Model: validator.checkModelDuplicates
    };
    registry.register(checks, validator);
}

/**
 * Custom validations for Reqlan documents.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_does_not_exist_error]
 * rq:["../../../reqlan rq/language/imports.rq".import_error_recovery]
 */
export class ReqlanValidator {

    constructor(private readonly services: ReqlanServices) {}

    checkModelDuplicates(model: Model, accept: ValidationAcceptor): void {
        this.checkDuplicateImportBindings(model, accept);
        this.checkDuplicateIdeaNames(model, accept);
        this.checkImportSyntax(model, accept);
        this.checkImportTargets(model, accept);
        this.checkFileReferenceTargets(model, accept);
    }

    /**
     * Local diagnostics for recoverable but invalid import shapes.
     * Keeps the rest of the file parseable — see import_error_recovery.
     */
    checkImportSyntax(model: Model, accept: ValidationAcceptor): void {
        for (const importDecl of model.imports) {
            if (isInvalidFromImport(importDecl)) {
                accept('error', 'Invalid from-import: expected a quoted path, then `import <idea>`.', {
                    node: importDecl
                });
                continue;
            }
            if (!isFromImport(importDecl) || isWellFormedFromImport(importDecl)) {
                continue;
            }
            if (importDecl.alias) {
                accept(
                    'error',
                    `Invalid syntax: use \`import "${unquoteReqlanString(importDecl.path)}" as ${importDecl.alias}\` for a namespace import, or \`from "${unquoteReqlanString(importDecl.path)}" import <idea>\`.`,
                    { node: importDecl }
                );
                continue;
            }
            accept(
                'error',
                `Invalid from-import: expected \`from "${unquoteReqlanString(importDecl.path)}" import <idea>\`.`,
                { node: importDecl }
            );
        }
    }

    checkDuplicateImportBindings(model: Model, accept: ValidationAcceptor): void {
        const seen = new Map<string, ImportBindingSource>();
        for (const importDecl of model.imports) {
            for (const binding of importBindings(importDecl)) {
                if (seen.has(binding.name)) {
                    accept('error', `'${binding.name}' is already defined in this file.`, {
                        node: binding.node,
                        property: binding.property
                    });
                } else {
                    seen.set(binding.name, binding);
                }
            }
        }
    }

    checkDuplicateIdeaNames(model: Model, accept: ValidationAcceptor): void {
        const seen = new Map<string, AstNode>();
        for (const importDecl of model.imports) {
            for (const binding of importBindings(importDecl)) {
                seen.set(binding.name, importDecl);
            }
        }
        for (const element of model.elements) {
            if (!isIdea(element) && !isOneLinerIdea(element)) {
                continue;
            }
            const name = element.name;
            if (seen.has(name)) {
                accept('error', `'${name}' is already defined in this file.`, {
                    node: element,
                    property: 'name'
                });
                continue;
            }
            const importedNameConflict = model.imports.some(importDecl =>
                importedIdeaNames(importDecl).includes(name)
            );
            if (importedNameConflict) {
                accept('error', `'${name}' is already defined in this file.`, {
                    node: element,
                    property: 'name'
                });
                continue;
            }
            seen.set(name, element);
        }
    }

    /**
     * Error underline when an `import` / `from` path does not resolve to a file.
     * Missing imported ideas are reported by the linker as unresolved references.
     */
    checkImportTargets(model: Model, accept: ValidationAcceptor): void {
        const document = AstUtils.getDocument(model);
        const { shared } = this.services;
        const pathContext = pathResolveContextFromServices(this.services);
        for (const importDecl of model.imports) {
            if (isInvalidFromImport(importDecl)) {
                continue;
            }
            if (isFromImport(importDecl) && !isWellFormedFromImport(importDecl)) {
                continue;
            }
            const rawPath = importPathOf(importDecl);
            const path = rawPath ? unquoteReqlanString(rawPath) : undefined;
            if (!path || isRemoteImportPath(path)) {
                continue;
            }
            if (isResolvableImportPath(
                path,
                document,
                shared.workspace.LangiumDocuments,
                shared.workspace.FileSystemProvider,
                pathContext
            )) {
                continue;
            }
            accept('error', `Could not resolve import '${path}'.`, {
                node: importDecl,
                property: 'path'
            });
        }
    }

    checkFileReferenceTargets(model: Model, accept: ValidationAcceptor): void {
        const document = AstUtils.getDocument(model);
        const { shared } = this.services;
        for (const link of collectFileLinks(
            document,
            shared.workspace.LangiumDocuments,
            shared.workspace.FileSystemProvider,
            pathResolveContextFromServices(this.services)
        )) {
            if (!link.targetIssue) {
                continue;
            }
            accept('warning', fileLinkTargetIssueMessage(link.targetIssue), {
                node: model,
                range: link.sourceRange
            });
        }
    }
}

type ImportBindingSource = ReturnType<typeof importBindings>[number];

function isRemoteImportPath(path: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path);
}
